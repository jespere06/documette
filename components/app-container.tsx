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

  const handleProcess = async (file: File) => {
    if (!templateData?.deepgram_api_key || !templateData?.gemini_api_key) {
      setConfigError("Error: Configuración crítica faltante. El proceso no puede continuar.")
      setCurrentStep("upload")
      return
    }

    setCurrentStep("transcribing")
    setProgress(10)

    try {
      // Pasos 1 y 2 (sin cambios)
      const formData = new FormData();
      formData.append("audio", file);
      formData.append("deepgram_api_key", templateData.deepgram_api_key);
      const transRes = await fetch("/api/transcribe", { method: "POST", body: formData });
      if (!transRes.ok) throw new Error(`Error en la transcripción: ${await transRes.text()}`);
      const { text: transcript } = await transRes.json();
      setProgress(35);
      setCurrentStep("diarizing");

      const identifyRes = await fetch("/api/identify-speakers", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ transcript, context: templateData.speaker_context, gemini_api_key: templateData.gemini_api_key }) });
      if (!identifyRes.ok) throw new Error(`Error identificando hablantes: ${await identifyRes.text()}`);
      const { diarizedTranscript, speakers, summary } = await identifyRes.json();
      setProgress(60);
      setCurrentStep("generating");

      // 3️⃣ Generate acta markdown
      const genRes = await fetch("/api/generate-acta", { 
        method: "POST", 
        headers: { "Content-Type": "application/json" }, 
        body: JSON.stringify({ 
            transcript: diarizedTranscript, 
            speakers, 
            gemini_api_key: templateData.gemini_api_key,
            prompt: userPrompt
        }) 
      });
      if (!genRes.ok) {
        const errorText = await genRes.text();
        throw new Error(`Error generando el acta: ${errorText}`);
      }
      const { markdown, agreements } = await genRes.json();
      setProgress(80);

      // --- [CORRECCIÓN CLAVE] AÑADIMOS UN GUARDIA DE VALIDACIÓN ---
      console.log("Respuesta de /api/generate-acta recibida. Verificando contenido...");
      if (!markdown || typeof markdown !== 'string' || markdown.trim() === '') {
        // Este error es mucho más específico y útil.
        throw new Error('La IA no pudo generar el contenido del acta (el resultado de markdown estaba vacío o era inválido). Por favor, intente de nuevo o con otro audio.');
      }
      console.log("Verificación de Markdown superada. Procediendo a generar DOCX...");

      // 4️⃣ Llamar a la API Route para generar el DOCX
      const docGenRes = await fetch("/api/generate-docx", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ markdown, userId: user.id }),
      });

      if (!docGenRes.ok) {
        const errorData = await docGenRes.json();
        throw new Error(`Error generando el documento DOCX: ${errorData.message || docGenRes.statusText}`);
      }

      const docBlob = await docGenRes.blob();
      const docUrl = URL.createObjectURL(docBlob);
      
      // 5️⃣ Set ActaData
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
      setProgress(100);
      setCurrentStep("complete");

    } catch (err: any) {
      console.error("Error en el proceso:", err);
      // Ahora el mensaje de error será más específico si falla la generación del acta.
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

        {(currentStep === "transcribing" || currentStep === "diarizing" || currentStep === "generating") && (
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