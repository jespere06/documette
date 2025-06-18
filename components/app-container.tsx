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
import type { ActaData, ProcessingStep, Speaker } from "@/app/page" // Mantengo tus tipos
import { Button } from "./ui/button"

// Interfaz para la configuración, sin cambios
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
  // --- ESTADOS REFACTORIZADOS ---
  // Estado para la vista principal que controla qué componente principal se muestra
  const [currentView, setCurrentView] = useState<"upload" | "processing" | "complete" | "error">("upload");
  // Estado para el paso específico dentro de la vista de "processing"
  const [processingStep, setProcessingStep] = useState<ProcessingStep>("uploading");
  
  const [audioFile, setAudioFile] = useState<File | null>(null);
  const [actaData, setActaData] = useState<ActaData | null>(null);
  const [progress, setProgress] = useState(0);
  const [templateData, setTemplateData] = useState<TemplateData | null>(null);
  const [isLoadingConfig, setIsLoadingConfig] = useState(true);
  const [configError, setConfigError] = useState<string | null>(null);
  const [userPrompt, setUserPrompt] = useState<string | null>(null);

  // Nuevos estados para el flujo asíncrono
  const [jobId, setJobId] = useState<string | null>(null);
  const pollingIntervalRef = useRef<NodeJS.Timeout | null>(null);

  // --- LÓGICA EXISTENTE ---
  useEffect(() => {
    // Tu lógica `fetchTemplateConfig` permanece exactamente igual
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

  // --- NUEVA LÓGICA DE POLLING ---
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
        
        // El tipo de `data` debe coincidir con lo que devuelve `/api/job-status`
        const data = await res.json();
        
        // Actualiza el paso de procesamiento para la UI
        // Aseguramos que el status de la BD es un ProcessingStep válido
        if (['transcribing', 'diarizing', 'generating'].includes(data.status)) {
            setProcessingStep(data.status as ProcessingStep);
        }

        if (data.status === 'complete') {
          stopPolling();
          // Cuando el trabajo está completo, la BD debe tener los datos para `ActaData`
          // Creamos el objeto `ActaData` a partir de los resultados del job
          const blob = await fetch(data.result_doc_url).then(r => r.blob());
          const docUrl = URL.createObjectURL(blob);

          setActaData({
            title: audioFile?.name.replace(/\.[^/.]+$/, "") || 'Acta generada',
            date: new Date().toISOString().split("T")[0],
            participants: (data.speakers as Speaker[] || []).map(s => s.name),
            speakers: data.speakers || [],
            summary: data.summary || '',
            agreements: data.agreements || [],
            transcript: data.diarized_transcript || '',
            duration: 0, // Este dato se pierde, se podría calcular si es necesario
            markdown: data.markdown_result || '',
            docUrl,
          });
          setCurrentView('complete');
        } else if (data.status === 'error') {
          stopPolling();
          setConfigError(data.error_message || "Ocurrió un error desconocido durante el proceso.");
          setCurrentView('error');
        }
      } catch (err: any) {
        stopPolling();
        console.error("Error durante el polling:", err);
        setConfigError(`Error de conexión al verificar el estado: ${err.message}`);
        setCurrentView('error');
      }
    };

    if (currentView === 'processing' && jobId) {
      if (!pollingIntervalRef.current) {
        pollStatus(); // Llama una vez inmediatamente
        pollingIntervalRef.current = setInterval(pollStatus, 4000); // Luego cada 4 segundos
      }
    }

    return () => stopPolling(); // Limpieza
  }, [currentView, jobId, audioFile]);


  // --- FUNCIONES DE MANEJO REFACTORIZADAS ---
  const handleFileUpload = (file: File) => {
    if (isLoadingConfig || configError || !templateData) {
        alert("Por favor, espere a que la configuración se cargue o solucione el error de configuración.");
        return;
    }
    setAudioFile(file);
    handleProcess(file);
  }

  const uploadToGCS = async (file: File, onProgress: (p: number) => void): Promise<{ publicUrl: string; fileName: string }> => {
    // Tu función uploadToGCS permanece exactamente igual
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
      // 1. Subir a Google Cloud Storage, actualizando la barra de progreso
      console.log("Iniciando subida a Google Cloud Storage...");
      const { publicUrl: audioUrl, fileName } = await uploadToGCS(file, (p) => setProgress(p));
      if (!audioUrl || !fileName) { throw new Error("La subida se completó, pero no se recibió una URL o un nombre de archivo."); }
      
      console.log("Subida completada. Enviando trabajo al backend...");
      setProcessingStep("transcribing"); // Cambiamos el texto a "Transcribiendo..."

      // 2. Enviar el trabajo al backend para que lo ponga en la cola de QStash
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
      setJobId(newJobId); // <-- Esto activa el polling en el useEffect.

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

  // --- RENDERIZADO CONDICIONAL ---
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