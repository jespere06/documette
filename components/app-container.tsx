"use client"

import { useState, useEffect } from "react"
import { createClient } from "@/lib/supabase/client"
import { AudioUpload } from "@/components/audio-upload"
import { ProcessingView } from "@/components/processing-view"
import { ActaEditor } from "@/components/acta-editor"
import { Header } from "@/components/header"
import { Footer } from "@/components/footer"
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert"
import { Terminal } from "lucide-react"
import type { RealtimeChannel, User as SupabaseUser } from "@supabase/supabase-js"
import type { ActaData, ProcessingStep, Speaker } from "@/app/page"

// Tipo para la fila de nuestra tabla 'actas'
type ActaRow = {
  id: string
  status: 'uploaded' | 'transcribing' | 'transcribed' | 'diarizing' | 'diarized' | 'generating' | 'generated' | 'complete' | 'error'
  file_name: string | null
  gcs_path: string | null
  transcript: string | null
  diarized_transcript: string | null
  speakers: Speaker[] | null
  summary: string | null
  markdown: string | null
  agreements: string[] | null
  created_at: string
  updated_at: string
}

interface TemplateData {
  gemini_api_key: string | null
  deepgram_api_key: string | null
  speaker_context: string | null
  default_prompt: string | null
}

interface AppContainerProps {
  user: SupabaseUser
}

export function AppContainer({ user }: AppContainerProps) {
  const [currentStep, setCurrentStep] = useState<ProcessingStep>("upload")
  const [audioFile, setAudioFile] = useState<File | null>(null)
  const [actaData, setActaData] = useState<ActaData | null>(null)
  const [progress, setProgress] = useState(0)
  const [templateData, setTemplateData] = useState<TemplateData | null>(null)
  const [isLoadingConfig, setIsLoadingConfig] = useState(true)
  const [configError, setConfigError] = useState<string | null>(null)
  const [userPrompt, setUserPrompt] = useState<string | null>(null);
  const [currentActaId, setCurrentActaId] = useState<string | null>(null);

  // useEffect para cargar la configuración (no cambia)
  useEffect(() => {
    const fetchTemplateConfig = async () => {
      setIsLoadingConfig(true);
      setConfigError(null);
      const supabase = createClient();
      try {
        const { data: userInfo, error: userError } = await supabase.from('user_info').select('template_id').eq('user_id', user.id).single();
        if (userError) throw new Error(`Error de base de datos al buscar su información [${userError.code}]: ${userError.message}.`);
        if (!userInfo || !userInfo.template_id) throw new Error("Su cuenta de usuario no tiene una plantilla de trabajo asignada. Por favor, contacte al administrador.");
        
        const { data: template, error: templateError } = await supabase.from('templates').select('gemini_api_key, deepgram_api_key, speaker_context, default_prompt').eq('id', userInfo.template_id).single();
        if (templateError) throw new Error(`Error de base de datos al buscar la plantilla [${templateError.code}]: ${templateError.message}.`);
        if (!template) throw new Error("La plantilla asignada a su cuenta no fue encontrada en la base de datos.");
        if (!template.gemini_api_key || !template.deepgram_api_key) throw new Error("La configuración de la plantilla está incompleta. Faltan claves de API.");
        
        setTemplateData(template);
        setUserPrompt(template.default_prompt);
      } catch (error: any) {
        console.error("Error final al cargar la configuración:", error.message);
        setConfigError(error.message);
      } finally {
        setIsLoadingConfig(false);
      }
    };
    fetchTemplateConfig();
  }, [user.id]);

  // useEffect para monitorear con Supabase Realtime (no cambia)
  useEffect(() => {
    if (!currentActaId) return;
    const supabase = createClient();
    const channel: RealtimeChannel = supabase
      .channel(`actas-follow-up:${currentActaId}`)
      .on<ActaRow>(
        'postgres_changes',
        { event: 'UPDATE', schema: 'public', table: 'actas', filter: `id=eq.${currentActaId}` },
        (payload) => {
          const newActa = payload.new;
          console.log('[Realtime] Acta actualizada recibida:', newActa);
          switch (newActa.status) {
            case 'transcribed':
              setCurrentStep('diarizing');
              setProgress(35);
              break;
            case 'diarized':
              setCurrentStep('generating');
              setProgress(60);
              break;
            case 'generated':
              setProgress(80);
              handleProcessFinished(newActa);
              break;
            case 'error':
              setConfigError(newActa.summary || "Ocurrió un error en el servidor.");
              setCurrentStep("upload");
              setProgress(0);
              channel.unsubscribe();
              break;
          }
        }
      )
      .subscribe((status, err) => {
        if (err) {
          console.error("[Realtime] Error en la subscripción:", err);
          setConfigError("No se pudo conectar al servicio de monitoreo.");
        }
      });
    return () => { supabase.removeChannel(channel); };
  }, [currentActaId]);

  const handleFileUpload = (file: File) => {
    if (isLoadingConfig || configError || !templateData) {
        alert("Por favor, espere a que la configuración se cargue o solucione el error de configuración.")
        return;
    }
    setAudioFile(file)
    handleProcessStart(file) // <--- Llamamos a la función correcta
  }

  // Lógica para subir a GCS (no cambia)
  const uploadToGCS = async (file: File): Promise<{ url: string; gcsPath: string }> => {
    const getSignedUrlRes = await fetch('/api/generate-upload-url', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ fileName: file.name, contentType: file.type })
    });
    if (!getSignedUrlRes.ok) throw new Error('No se pudo obtener una URL firmada para subir el archivo.');
    const { signedUrl, publicUrl, fileName: gcsPath } = await getSignedUrlRes.json();
    const uploadRes = await fetch(signedUrl, { method: 'PUT', headers: { 'Content-Type': file.type }, body: file });
    if (!uploadRes.ok) throw new Error('Error al subir el archivo a Google Cloud Storage.');
    return { url: publicUrl, gcsPath };
  };
  
  // ====================================================================
  // ESTA ES LA FUNCIÓN CLAVE CORREGIDA
  // ====================================================================
  const handleProcessStart = async (file: File) => {
    if (!templateData?.deepgram_api_key) {
      setConfigError("Error: Falta la clave de API de Deepgram.");
      return;
    }

    setCurrentStep("uploading");
    setProgress(5);

    try {
      const supabase = createClient();
      
      // 1. Crear el registro en Supabase para obtener un ID.
      console.log("Paso 1: Creando registro inicial en Supabase...");
      const { data: newActa, error: createError } = await supabase
        .from('actas')
        .insert({ user_id: user.id, file_name: file.name, status: 'uploaded' })
        .select('id')
        .single();
      if (createError) throw new Error(`Error creando el acta en la base de datos: ${createError.message}`);
      
      setCurrentActaId(newActa.id);
      
      // 2. Subir el archivo a GCS.
      console.log("Paso 2: Subiendo archivo a GCS...");
      const { url: audioUrl, gcsPath } = await uploadToGCS(file);
      
      // 3. Actualizar el registro del acta con la ruta.
      console.log("Paso 3: Actualizando el acta con la ruta del archivo...");
      await supabase.from('actas').update({ gcs_path: gcsPath }).eq('id', newActa.id);

      setProgress(20);
      setCurrentStep("transcribing");
      
      // 4. Llamar a la API para *iniciar* la transcripción.
      console.log("Paso 4: Invocando a /api/transcribe...");
      const transRes = await fetch("/api/transcribe", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          audioUrl: audioUrl,
          actaId: newActa.id, // <<-- La variable newActa SÍ existe en este contexto
          deepgram_api_key: templateData.deepgram_api_key,
        }),
      });

      if (!transRes.ok) {
        const errorBody = await transRes.json();
        throw new Error(`Error iniciando la transcripción: ${errorBody.error}`);
      }
      
      console.log("¡Proceso iniciado! Esperando actualizaciones via Realtime.");

    } catch (err: any) {
      console.error("Error en la fase de inicio del proceso:", err);
      setConfigError(`Ocurrió un error al iniciar: ${err.message}`);
      setCurrentStep("upload");
      setProgress(0);
      if (currentActaId) setCurrentActaId(null);
    }
  };
  
  // ====================================================================
  // ESTA ES LA OTRA FUNCIÓN CLAVE NUEVA
  // ====================================================================
  const handleProcessFinished = async (finalActaData: ActaRow) => {
    try {
        if (!finalActaData.markdown) throw new Error("El acta se generó pero el contenido está vacío.");

        console.log("Paso Final: Generando documento DOCX...");
        const docGenRes = await fetch("/api/generate-docx", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ markdown: finalActaData.markdown, userId: user.id }),
        });
        if (!docGenRes.ok) throw new Error(`Error generando el DOCX: ${(await docGenRes.json()).message}`);
        
        const docBlob = await docGenRes.blob();
        const docUrl = URL.createObjectURL(docBlob);
        
        setActaData({ 
            title: finalActaData.file_name?.replace(/\.[^/.]+$/, "") || "Acta", 
            date: new Date(finalActaData.created_at).toISOString().split("T")[0],
            participants: finalActaData.speakers?.map((s) => s.name) || [], 
            speakers: finalActaData.speakers || [],
            summary: finalActaData.summary || "", 
            agreements: finalActaData.agreements || [], 
            transcript: finalActaData.diarized_transcript || "", 
            duration: 0,
            markdown: finalActaData.markdown, 
            docUrl 
        });

        if (finalActaData.gcs_path) {
            fetch("/api/delete-audio", { // Asumimos que esta API se adapta para GCS
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ publicId: finalActaData.gcs_path }),
            }).catch(err => console.error("La solicitud de borrado del audio falló:", err));
        }

        setProgress(100);
        setCurrentStep("complete");

    } catch(err: any) {
        console.error("Error en la fase final del cliente:", err);
        setConfigError(`Ocurrió un error al finalizar el proceso: ${err.message}`);
        setCurrentStep("upload");
        setProgress(0);
    } finally {
        if (currentActaId) setCurrentActaId(null);
    }
  };

  const resetProcess = () => {
    setCurrentStep("upload");
    setAudioFile(null);
    setActaData(null);
    setProgress(0);
    setConfigError(null);
    if (currentActaId) setCurrentActaId(null);
  };

  // El return con el JSX no cambia
  return (
    <div className="min-h-screen bg-slate-50 flex flex-col">
      <Header user={user} />
      <main className="flex-grow container mx-auto px-6 py-6 max-w-6xl">
        {configError && (
          <Alert variant="destructive" className="mb-4">
            <Terminal className="h-4 w-4" />
            <AlertTitle>Error de Configuración o Proceso</AlertTitle>
            <AlertDescription>{configError}</AlertDescription>
          </Alert>
        )}
        
        {currentStep === "upload" && (
          <AudioUpload onFileUpload={handleFileUpload} disabled={isLoadingConfig || !!configError} />
        )}

        {(currentStep === "uploading" || currentStep === "transcribing" || currentStep === "diarizing" || currentStep === "generating") && (
          <ProcessingView step={currentStep} progress={progress} fileName={audioFile?.name || ""} fileSize={audioFile?.size || 0} />
        )}

    
        {currentStep === "complete" && actaData && (
          // ===============================================
          // [NUEVO] CÓDIGO AÑADIDO PARA DEPURACIÓN
          // ===============================================
          <>
            {console.log("DEBUG: Datos finales para ActaEditor:", actaData)}
            <ActaEditor actaData={actaData} onReset={resetProcess} onUpdate={setActaData} />
          </>
          // ===============================================
        )}
      </main>
      <Footer />
    </div>
  )
}