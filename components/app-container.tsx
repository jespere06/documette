"use client"

import { useState, useEffect, useRef } from "react"
import { createClient } from "@/lib/supabase/client"
import { AudioUpload } from "@/components/audio-upload"
import { ProcessingView } from "@/components/processing-view"
import { ActaEditor } from "@/components/acta-editor"
import { Header } from "@/components/header"
import { Footer } from "@/components/footer"
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert"
import { Terminal, RotateCw } from "lucide-react"
import type { User as SupabaseUser } from "@supabase/supabase-js"
import type { ActaData, ProcessingStep, Speaker } from "@/app/page"
import { Button } from "./ui/button"

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
  // --- ESTADOS ---
  const [currentView, setCurrentView] = useState<"upload" | "processing" | "complete" | "error">("upload");
  const [processingStep, setProcessingStep] = useState<ProcessingStep>("uploading");
  const [audioFile, setAudioFile] = useState<File | null>(null);
  const [actaData, setActaData] = useState<ActaData | null>(null);
  const [progress, setProgress] = useState(0);
  const [templateData, setTemplateData] = useState<TemplateData | null>(null);
  const [isLoadingConfig, setIsLoadingConfig] = useState(true);
  const [configError, setConfigError] = useState<string | null>(null);
  const [userPrompt, setUserPrompt] = useState<string | null>(null);
  const [jobId, setJobId] = useState<string | null>(null);
  const pollingIntervalRef = useRef<NodeJS.Timeout | null>(null);

  // --- EFECTO PARA CARGAR CONFIGURACIÓN INICIAL ---
  useEffect(() => {
    const fetchTemplateConfig = async () => {
      setIsLoadingConfig(true);
      setConfigError(null);
      const supabase = createClient();
      try {
        const { data: userInfo, error: userError } = await supabase.from('user_info').select('template_id').eq('user_id', user.id).single();
        if (userError) throw new Error(`Error de base de datos al buscar su información [${userError.code}]: ${userError.message}.`);
        if (!userInfo || !userInfo.template_id) throw new Error("Su cuenta de usuario no tiene una plantilla de trabajo asignada. Por favor, contacte al administrador.");
        
        const templateId = userInfo.template_id;
        const { data: template, error: templateError } = await supabase.from('templates').select('gemini_api_key, deepgram_api_key, speaker_context, default_prompt').eq('id', templateId).single();
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

  // --- LÓGICA DE POLLING Y MANEJO DE PROGRESO ---
  const stopPolling = () => {
    if (pollingIntervalRef.current) {
      clearInterval(pollingIntervalRef.current);
      pollingIntervalRef.current = null;
    }
  };

  useEffect(() => {
    const pollStatus = async () => {
      if (!jobId) return;

      try {
        const res = await fetch(`/api/job-status?id=${jobId}`);
        if (!res.ok) {
           const errorData = await res.json();
           throw new Error(errorData.error || `Fallo al verificar estado (HTTP ${res.status})`);
        }
        
        const data = await res.json();

        switch (data.status) {
          case 'submitted':
          case 'transcribing':
            setProcessingStep('transcribing');
            setProgress(25);
            break;
          case 'diarizing':
            setProcessingStep('diarizing');
            setProgress(50);
            break;
          case 'generating':
            setProcessingStep('generating');
            setProgress(75);
            break;
          case 'complete':
            stopPolling();
            setProgress(90); // Progreso al 90% mientras se genera el DOCX
            
            if (!data.markdown_result) {
              throw new Error("El proceso se completó, pero no se encontró el contenido del acta.");
            }

            console.log("Job completo. Generando DOCX desde el cliente...");
            const docGenRes = await fetch("/api/generate-docx", {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({ markdown: data.markdown_result, userId: user.id }),
            });

            if (!docGenRes.ok) {
              const errorData = await docGenRes.json();
              throw new Error(`Error generando el documento DOCX: ${errorData.message || docGenRes.statusText}`);
            }

            const docBlob = await docGenRes.blob();
            const docUrl = URL.createObjectURL(docBlob); // Crear la URL que ActaEditor espera

            setActaData({
              title: audioFile?.name.replace(/\.[^/.]+$/, "") || 'Acta generada',
              date: new Date().toISOString().split("T")[0],
              participants: (data.speakers as Speaker[] || []).map(s => s.name),
              speakers: data.speakers || [],
              summary: data.summary || '',
              agreements: data.agreements || [],
              transcript: data.diarized_transcript || '',
              duration: 0, 
              markdown: data.markdown_result,
              docUrl: docUrl, // Se pasa la URL del blob para que ActaEditor funcione
            });

            setProgress(100);
            setCurrentView('complete');
            break;
          case 'error':
            stopPolling();
            setConfigError(data.error_message || "Ocurrió un error desconocido durante el proceso.");
            setCurrentView('error');
            break;
        }
      } catch (err: any) {
        stopPolling();
        console.error("Error durante el polling o la generación del DOCX:", err);
        setConfigError(`Error finalizando el proceso: ${err.message}`);
        setCurrentView('error');
      }
    };

    if (currentView === 'processing' && jobId) {
      if (!pollingIntervalRef.current) {
        pollStatus();
        pollingIntervalRef.current = setInterval(pollStatus, 4000);
      }
    }

    return () => stopPolling();
  }, [currentView, jobId, audioFile, user.id]);


  // --- MANEJADORES DE ACCIONES ---
  const handleFileUpload = (file: File) => {
    if (isLoadingConfig || configError || !templateData) {
        alert("Por favor, espere a que la configuración se cargue o solucione el error de configuración.");
        return;
    }
    setAudioFile(file);
    handleProcess(file);
  }

  const uploadToGCS = async (file: File, onProgress: (p: number) => void): Promise<{ publicUrl: string; fileName: string }> => {
    const res = await fetch('/api/generate-upload-url', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ fileName: file.name, contentType: file.type }),
    });
    if (!res.ok) {
      const errorData = await res.json();
      throw new Error(`No se pudo obtener la URL firmada: ${errorData.error}`);
    }
    const { signedUrl, publicUrl, fileName } = await res.json();
    if (!signedUrl || !publicUrl || !fileName) {
      throw new Error("La respuesta de la API de generación de URL está incompleta.");
    }
    return new Promise((resolve, reject) => {
      const xhr = new XMLHttpRequest();
      xhr.open('PUT', signedUrl, true);
      xhr.setRequestHeader('Content-Type', file.type);
      xhr.upload.onprogress = (event) => {
        if (event.lengthComputable) {
          const percentage = Math.round((event.loaded / event.total) * 100);
          onProgress(percentage);
        }
      };
      xhr.onload = () => {
        if (xhr.status >= 200 && xhr.status < 300) {
          resolve({ publicUrl, fileName });
        } else {
          reject(new Error(`Error al subir a GCS: Estado ${xhr.status} - ${xhr.statusText}`));
        }
      };
      xhr.onerror = () => { reject(new Error('Error de red durante la subida del archivo.')); };
      xhr.send(file);
    });
  };

  const handleProcess = async (file: File) => {
    if (!templateData?.deepgram_api_key || !templateData?.gemini_api_key) {
      setConfigError("Error: Configuración crítica faltante. El proceso no puede continuar.");
      setCurrentView("upload");
      return;
    }

    resetProcess();
    setAudioFile(file);
    setCurrentView("processing");
    setProcessingStep("uploading");
    setProgress(0);

    try {
      const UPLOAD_PROGRESS_MAX = 25;
      
      console.log("Iniciando subida a Google Cloud Storage...");
      const { publicUrl: audioUrl, fileName } = await uploadToGCS(file, (p) => {
        setProgress(Math.round(p * (UPLOAD_PROGRESS_MAX / 100)));
      });
      if (!audioUrl || !fileName) { throw new Error("La subida se completó, pero no se recibió una URL o un nombre de archivo."); }
      
      console.log("Subida completada. Enviando trabajo al backend...");
      setProcessingStep("transcribing");

      const res = await fetch('/api/submit-job', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ audioUrl, fileName, config: templateData, prompt: userPrompt, userId: user.id })
      });

      if (!res.ok) {
        const errorData = await res.json();
        throw new Error(errorData.error || `Error al enviar el trabajo (HTTP ${res.status}).`);
      }

      const { jobId: newJobId } = await res.json();
      setJobId(newJobId);

    } catch (err: any) {
      console.error("Error en el proceso de envío:", err);
      setConfigError(`Ocurrió un error durante el proceso: ${err.message}`);
      setCurrentView("error");
    }
  }

  const resetProcess = () => {
    stopPolling();
    setCurrentView("upload");
    setAudioFile(null);
    setActaData(null);
    setProgress(0);
    setConfigError(null);
    setJobId(null);
    setProcessingStep("uploading");
  }

  // --- RENDERIZADO CONDICIONAL DE LA UI ---
  return (
    <div className="min-h-screen bg-slate-50 flex flex-col">
      <Header user={user} />
      <main className="flex-grow container mx-auto px-6 py-6 max-w-6xl">
        {configError && (
          <Alert variant="destructive" className="mb-4">
            <Terminal className="h-4 w-4" />
            <AlertTitle>Error de Configuración o Proceso</AlertTitle>
            <AlertDescription>
              {configError}
              {currentView === 'error' && (
                <Button onClick={resetProcess} variant="outline" size="sm" className="mt-2 ml-auto flex items-center">
                  <RotateCw className="mr-2 h-4 w-4" />
                  Intentar de nuevo
                </Button>
              )}
            </AlertDescription>
          </Alert>
        )}
        
        {currentView === "upload" && (
          <AudioUpload onFileUpload={handleFileUpload} disabled={isLoadingConfig || !!configError} />
        )}

        {currentView === "processing" && (
          <ProcessingView step={processingStep} progress={progress} fileName={audioFile?.name || ""} fileSize={audioFile?.size || 0} />
        )}

        {currentView === "complete" && actaData && (
          <ActaEditor actaData={actaData} onReset={resetProcess} onUpdate={setActaData} />
        )}
      </main>
      <Footer />
    </div>
  )
}