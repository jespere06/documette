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
import type { User as SupabaseUser } from "@supabase/supabase-js"
import type { ActaData, ProcessingStep, Speaker } from "@/app/page"

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

  const handleFileUpload = (file: File) => {
    if (isLoadingConfig || configError || !templateData) {
        alert("Por favor, espere a que la configuración se cargue o solucione el error de configuración.")
        return;
    }
    setAudioFile(file)
    handleProcess(file)
  }

  const uploadToCloudinary = async (file: File): Promise<{ secure_url: string; public_id: string }> => {
    const signRes = await fetch('/api/sign-cloudinary-upload', { method: 'POST' });
    if (!signRes.ok) throw new Error("No se pudo obtener la firma para la subida del archivo.");
    const { signature, timestamp } = await signRes.json();

    const formData = new FormData();
    formData.append('file', file);
    formData.append('api_key', process.env.NEXT_PUBLIC_CLOUDINARY_API_KEY!);
    formData.append('timestamp', timestamp);
    formData.append('signature', signature);
    formData.append('folder', 'audios_actas');

    const cloudName = process.env.NEXT_PUBLIC_CLOUDINARY_CLOUD_NAME;
    const uploadUrl = `https://api.cloudinary.com/v1_1/${cloudName}/video/upload`;
    
    const uploadRes = await fetch(uploadUrl, { method: 'POST', body: formData });
    
    if (!uploadRes.ok) {
        const errorData = await uploadRes.json();
        throw new Error(`Error al subir a Cloudinary: ${errorData.error.message}`);
    }

    const uploadData = await uploadRes.json();
    return {
      secure_url: uploadData.secure_url,
      public_id: uploadData.public_id
    };
  }

  const handleProcess = async (file: File) => {
    if (!templateData?.deepgram_api_key || !templateData?.gemini_api_key) {
      setConfigError("Error: Configuración crítica faltante. El proceso no puede continuar.")
      setCurrentStep("upload")
      return
    }

    // Iniciar con el estado visual correcto: "uploading"
    setCurrentStep("uploading"); 
    setProgress(5);

    let audioPublicId: string | null = null;

    try {
      // 1. Subir a Cloudinary
      console.log("Subiendo archivo a Cloudinary...");
      const { secure_url: audioUrl, public_id } = await uploadToCloudinary(file);
      audioPublicId = public_id;
      console.log("Subida completada. URL:", audioUrl, "Public ID:", audioPublicId);
      
      // La subida terminó, ahora actualiza el estado a "transcribing" para el siguiente paso
      setCurrentStep("transcribing");
      setProgress(20);

      // 2. Llamar a la API de transcripción
      const transRes = await fetch("/api/transcribe", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          audioUrl: audioUrl,
          deepgram_api_key: templateData.deepgram_api_key,
        }),
      });
      if (!transRes.ok) throw new Error(`Error en la transcripción: ${await transRes.text()}`);
      const { text: transcript } = await transRes.json();
      
      setProgress(35);
      setCurrentStep("diarizing");

      // 3. Identificar hablantes
      const identifyRes = await fetch("/api/identify-speakers", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ transcript, context: templateData.speaker_context, gemini_api_key: templateData.gemini_api_key }) });
      if (!identifyRes.ok) throw new Error(`Error identificando hablantes: ${await identifyRes.text()}`);
      const { diarizedTranscript, speakers, summary } = await identifyRes.json();
      
      setProgress(60);
      setCurrentStep("generating");

      // 4. Generar el acta
      const genRes = await fetch("/api/generate-acta", { 
        method: "POST", 
        headers: { "Content-Type": "application/json" }, 
        body: JSON.stringify({ transcript: diarizedTranscript, speakers, gemini_api_key: templateData.gemini_api_key, prompt: userPrompt }) 
      });
      if (!genRes.ok) throw new Error(`Error generando el acta: ${await genRes.text()}`);
      const { markdown, agreements } = await genRes.json();
      
      setProgress(80);

      if (!markdown || typeof markdown !== 'string' || markdown.trim() === '') {
        throw new Error('La IA no pudo generar el contenido del acta. Por favor, intente de nuevo o con otro audio.');
      }

      // 5. Generar el documento DOCX
      const docGenRes = await fetch("/api/generate-docx", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ markdown, userId: user.id }),
      });
      if (!docGenRes.ok) throw new Error(`Error generando el documento DOCX: ${(await docGenRes.json()).message || docGenRes.statusText}`);
      
      const docBlob = await docGenRes.blob();
      const docUrl = URL.createObjectURL(docBlob);
      
      setActaData({ 
        title: file.name.replace(/\.[^/.]+$/, ""), 
        date: new Date().toISOString().split("T")[0], 
        participants: speakers.map((s: Speaker) => s.name), 
        speakers, 
        summary: summary || "", 
        agreements: agreements || [], 
        transcript: diarizedTranscript, 
        duration: 0, 
        markdown, 
        docUrl 
      });

      // 6. Borrar el archivo de audio de Cloudinary
      console.log("Proceso completado. Solicitando borrado del audio original de Cloudinary...");
      fetch("/api/delete-audio", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ publicId: audioPublicId }),
      }).catch(err => {
        console.error("La solicitud de borrado del audio falló:", err);
      });

      setProgress(100);
      setCurrentStep("complete");

    } catch (err: any) {
      console.error("Error en el proceso:", err);
      setConfigError(`Ocurrió un error durante el proceso: ${err.message}`);
      setCurrentStep("upload");
      setProgress(0);
    }
  }

  const resetProcess = () => {
    setCurrentStep("upload");
    setAudioFile(null);
    setActaData(null);
    setProgress(0);
    setConfigError(null);
  }

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
          <ActaEditor actaData={actaData} onReset={resetProcess} onUpdate={setActaData} />
        )}
      </main>
      <Footer />
    </div>
  )
}