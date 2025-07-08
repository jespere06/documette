"use client"

import { useState, useEffect, useCallback, useRef } from "react"
import { createClient } from "@/lib/supabase/client"
import { AudioUpload } from "@/components/audio-upload"
import { ProcessingView } from "@/components/processing-view"
import { ActaEditor } from "@/components/acta-editor"
import { Header } from "@/components/header"
import { Footer } from "@/components/footer"
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert"
import { Button } from "@/components/ui/button"
import { Terminal } from "lucide-react"
import type { User as SupabaseUser, RealtimeChannel } from "@supabase/supabase-js"
import type { ActaData, Speaker, JobStatus } from "@/app/page"
import { v4 as uuidv4 } from 'uuid';

// Tipo para un registro de trabajo de la tabla job_instances
export interface Job { 
  id: string;
  user_id: string;
  status: JobStatus;
  title: string;
  audio_url: string | null;
  transcription_url: string | null;
  transcription_diarized_url: string | null;
  speakers_list: Speaker[] | null;
  markdown_url: string | null; 
  summary: string | null;
  agreements: string[] | null;
  docx_url: string | null;
  created_at: string;
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

const capitalizeTitle = (fileName: string): string => {
    const nameWithoutExtension = fileName.replace(/\.[^/.]+$/, "");
    if (!nameWithoutExtension) return "Sin Título";
    return nameWithoutExtension.charAt(0).toUpperCase() + nameWithoutExtension.slice(1);
}

// Función actualizada para mapear estados a porcentajes de progreso
const mapStatusToProgress = (status: JobStatus): number => {
    const progressMap: Record<JobStatus, number> = {
        uploading: 5,
        uploaded: 10,
        transcribing: 20,
        transcribed: 35,
        diarizing: 45,
        diarized: 60,
        generating: 70,
        generated: 80,
        docxing: 90,
        complete: 100,
        error: 100, 
    };
    return progressMap[status] || 0;
}

export function AppContainer({ user }: AppContainerProps) {
  const [activeJob, setActiveJob] = useState<Job | null>(null);
  const [templateData, setTemplateData] = useState<TemplateData | null>(null)
  const [isLoadingConfig, setIsLoadingConfig] = useState(true)
  const [configError, setConfigError] = useState<string | null>(null)
  const [isUploading, setIsUploading] = useState(false);
  const [currentFileSize, setCurrentFileSize] = useState(0);
  
  const [fullActaData, setFullActaData] = useState<ActaData | null>(null);
  const [isLoadingExtraData, setIsLoadingExtraData] = useState(false);
  
  // Ref para mantener la instancia del canal de Supabase Realtime
  const channelRef = useRef<RealtimeChannel | null>(null);

  const fetchTextContentFromUrl = useCallback(async (url: string | null): Promise<string> => {
    if (!url) return "Contenido no disponible (URL no proporcionada).";
    let fetchUrl = url;
    if (url.startsWith("gs://")) {
        const bucketAndPath = url.substring(5);
        fetchUrl = `https://storage.googleapis.com/${bucketAndPath}`;
    }
    console.log(`[AppContainer] Attempting to fetch content from: ${fetchUrl}`);
    try {
        const response = await fetch(fetchUrl);
        if (!response.ok) {
            const errorText = await response.text().catch(() => "Could not retrieve error body");
            console.error(`[AppContainer] Error fetching content from ${fetchUrl}. Status: ${response.status} ${response.statusText}. Body: ${errorText}`);
            return `Error al cargar contenido: ${response.status} ${response.statusText}`;
        }
        const text = await response.text();
        return text;
    } catch (error: any) {
        console.error(`[AppContainer] Network or other error fetching content from ${fetchUrl}:`, error);
        return `Error al cargar contenido: ${error.message || 'Load failed'}`;
    }
  }, []);

  // Efecto para construir/actualizar fullActaData basado en activeJob
  useEffect(() => {
    if (activeJob) {
        console.log(`[AppContainer] useEffect for fullActaData triggered. Job ID: ${activeJob.id}, Status: ${activeJob.status}`);
        console.log(`[AppContainer] Current activeJob agreements:`, activeJob.agreements);

        // Actualizar o inicializar fullActaData con los datos disponibles en activeJob
        const transcriptValue = 
            (fullActaData && fullActaData.title === (activeJob.title || "Sin Título")) 
            ? fullActaData.transcript 
            : "Cargando transcripción...";

        setFullActaData(prevFullActaData => ({
            title: activeJob.title || "Sin Título",
            date: new Date(activeJob.created_at).toISOString().split("T")[0],
            participants: activeJob.speakers_list?.map(s => s.name) || [],
            speakers: activeJob.speakers_list || [],
            summary: activeJob.summary || "Resumen no disponible.",
            agreements: activeJob.agreements || [], 
            transcript: (prevFullActaData && prevFullActaData.title === (activeJob.title || "Sin Título") && prevFullActaData.transcript && !prevFullActaData.transcript.startsWith("Cargando")) 
                        ? prevFullActaData.transcript 
                        : "Cargando transcripción...",
            docUrl: activeJob.docx_url || "",
            duration: 0,
        }));

        if (activeJob.status === 'complete' && activeJob.transcription_diarized_url) {
            const needsTranscriptLoad = !fullActaData || 
                                        fullActaData.transcript.startsWith("Cargando") || 
                                        fullActaData.transcript === "Error al cargar transcripción." ||
                                        fullActaData.title !== (activeJob.title || "Sin Título"); 

            if (needsTranscriptLoad) {
                console.log(`[AppContainer] Job ${activeJob.id} is complete. Fetching transcript...`);
                setIsLoadingExtraData(true);
                fetchTextContentFromUrl(activeJob.transcription_diarized_url)
                .then((transcriptContent) => {
                    console.log(`[AppContainer] Transcript loaded for ${activeJob.id}.`);
                    setFullActaData(prevData => {
                        if (prevData && prevData.title === (activeJob.title || "Sin Título")) { 
                           return {...prevData, transcript: transcriptContent };
                        }
                        return prevData;
                    });
                }).catch(error => {
                    console.error("[AppContainer] Error loading transcript content:", error);
                    setFullActaData(prevData => {
                        if (prevData && prevData.title === (activeJob.title || "Sin Título")) {
                            return { ...prevData, transcript: "Error al cargar transcripción." };
                        }
                        return prevData;
                    });
                }).finally(() => {
                    setIsLoadingExtraData(false);
                });
            } else {
                 console.log(`[AppContainer] Job ${activeJob.id} is complete. Transcript already loaded or not needed.`);
                 setIsLoadingExtraData(false);
            }
        }
    } else {
        if (fullActaData !== null) {
            console.log("[AppContainer] No active job, clearing fullActaData.");
            setFullActaData(null);
        }
    }
  }, [activeJob, fetchTextContentFromUrl]);

  useEffect(() => {
    const handleBeforeUnload = (event: BeforeUnloadEvent) => {
      if (isUploading) {
        event.preventDefault();
        event.returnValue = "La subida de un archivo está en progreso. ¿Estás seguro de que quieres salir? El proceso se cancelará.";
      }
    };
    window.addEventListener("beforeunload", handleBeforeUnload);
    return () => {
      window.removeEventListener("beforeunload", handleBeforeUnload);
    };
  }, [isUploading]);

  useEffect(() => {
    const fetchTemplateConfig = async () => {
        setIsLoadingConfig(true);
        setConfigError(null);
        const supabase = createClient();
        try {
            const { data: userInfo, error: userError } = await supabase.from('user_info').select('template_id').eq('user_id', user.id).single();
            if (userError) throw new Error(`Error al buscar su información [${userError.code}]: ${userError.message}.`);
            if (!userInfo || !userInfo.template_id) throw new Error("Su cuenta no tiene una plantilla asignada. Contacte al administrador.");
            
            const { data: template, error: templateError } = await supabase.from('templates').select('gemini_api_key, deepgram_api_key, speaker_context, default_prompt').eq('id', userInfo.template_id).single();
            if (templateError) throw new Error(`Error al buscar la plantilla [${templateError.code}]: ${templateError.message}.`);
            if (!template) throw new Error("La plantilla asignada no fue encontrada.");
            if (!template.gemini_api_key || !template.deepgram_api_key) throw new Error("La configuración de la plantilla está incompleta (faltan claves de API).");
            
            setTemplateData(template);
        } catch (error: any) {
            console.error("[AppContainer] Error loading configuration:", error.message);
            setConfigError(error.message);
        } finally {
            setIsLoadingConfig(false);
        }
    };
    if (user?.id) fetchTemplateConfig();
  }, [user.id]);

  // --- EFECTO MODIFICADO PARA REALTIME ROBUSTO ---
  useEffect(() => {
    if (!user?.id) return;

    const supabase = createClient();

    // Función que configura (o re-configura) el canal de Realtime
    const setupChannel = () => {
      // Primero, nos aseguramos de limpiar cualquier canal existente para evitar duplicados.
      if (channelRef.current) {
        supabase.removeChannel(channelRef.current)
          .catch(err => console.error("[AppContainer] Error removing previous channel", err));
      }

      console.log("[AppContainer] Setting up new Realtime channel...");
      const newChannel = supabase
        .channel(`job-updates-for-${user.id}`)
        .on('postgres_changes', {
            event: '*', 
            schema: 'public',
            table: 'job_instances',
            filter: `user_id=eq.${user.id}`
        }, (payload) => {
            console.log('[AppContainer] Realtime job change detected. Event:', payload.eventType, 'New Data:', payload.new ? JSON.parse(JSON.stringify(payload.new)) : "N/A");
            setActiveJob(currentActiveJob => {
                const newRecord = payload.new as Job;
                const oldRecordId = (payload.old as {id?: string})?.id;

                if (payload.eventType === 'INSERT') {
                    if (currentActiveJob && currentActiveJob.id === newRecord.id && currentActiveJob.status === 'uploading') {
                        return newRecord;
                    }
                    if (!currentActiveJob) {
                        return newRecord;
                    }
                    return currentActiveJob;
                } else if (payload.eventType === 'UPDATE') {
                    if (currentActiveJob && newRecord.id === currentActiveJob.id) {
                        return newRecord;
                    }
                    return currentActiveJob;
                } else if (payload.eventType === 'DELETE') {
                    if (currentActiveJob && oldRecordId && oldRecordId === currentActiveJob.id) {
                        return null; 
                    }
                    return currentActiveJob;
                }
                return currentActiveJob; 
            });
        })
        .subscribe((status, err) => { 
            if (status === 'SUBSCRIBED') {
                console.log(`[AppContainer] Subscribed to job updates for user ${user.id}`);
            }
            if (status === 'CHANNEL_ERROR' || status === 'TIMED_OUT') {
                console.error('[AppContainer] Realtime subscription error:', status, err);
                setConfigError('Hubo un problema con la conexión en tiempo real. Se intentará reconectar.');
            }
        });
        
      channelRef.current = newChannel;
    };

    // Función que se ejecuta cuando la visibilidad de la pestaña cambia
    const handleVisibilityChange = () => {
      if (document.visibilityState === 'visible') {
        const channel = channelRef.current;
        // Si la pestaña es visible y el canal está cerrado o en un estado de error, lo reiniciamos.
        if (channel && (channel.state === 'closed' || channel.state === 'errored')) {
           console.log(`[AppContainer] Tab is visible, attempting to reconnect Realtime. Current state: ${channel.state}`);
           setupChannel(); // Re-crear el canal para forzar la reconexión
        } else {
           console.log(`[AppContainer] Tab is visible, Realtime connection is healthy (${channel?.state}).`);
        }
      }
    };

    const fetchLatestJob = async () => {
        console.log("[AppContainer] Fetching latest job on mount or user change for user:", user.id);
        const { data, error } = await supabase
            .from('job_instances')
            .select('*')
            .eq('user_id', user.id)
            .order('created_at', { ascending: false })
            .limit(1);

        if (error) {
            console.error("[AppContainer] Error fetching latest job:", error);
            setConfigError("No se pudo cargar el estado del último trabajo.");
        } else if (data && data.length > 0) {
            console.log("[AppContainer] Found latest job from DB:", data[0]);
            setActiveJob(prevJob => {
                if (prevJob && (prevJob.status === 'uploading' || prevJob.status === 'uploaded')) {
                    if (prevJob.id === (data[0] as Job).id) return data[0] as Job;
                    return prevJob; 
                }
                return data[0] as Job; 
            });
        } else {
            console.log("[AppContainer] No existing jobs found for user.");
            setActiveJob(null); 
        }
    };
    
    // Ejecución inicial
    fetchLatestJob();
    setupChannel();

    // Añadir el listener para la visibilidad de la página
    document.addEventListener('visibilitychange', handleVisibilityChange);

    // Función de limpieza
    return () => {
        console.log("[AppContainer] Cleaning up job subscription channel and visibility listener.");
        if (channelRef.current) {
            supabase.removeChannel(channelRef.current)
                .catch(err => console.error("[AppContainer] Error removing channel on cleanup", err));
        }
        document.removeEventListener('visibilitychange', handleVisibilityChange);
    };
  }, [user.id]); 

  const handleFileUpload = useCallback(async (file: File) => {
    if (!user?.id) {
        setConfigError("Usuario no identificado. No se puede subir el archivo.");
        return;
    }
    if (isLoadingConfig || !templateData) {
        alert("Espere a que la configuración se cargue o resuelva errores de configuración.");
        return;
    }
    if (configError) setConfigError(null); 
    setCurrentFileSize(file.size);

    const supabase = createClient();
    const jobId = uuidv4();
    let jobCreatedInDb = false;

    const optimisticJob: Job = {
        id: jobId,
        user_id: user.id,
        title: capitalizeTitle(file.name),
        status: 'uploading',
        created_at: new Date().toISOString(),
        audio_url: null, transcription_url: null, transcription_diarized_url: null,
        speakers_list: null, markdown_url: null, summary: null, agreements: null, docx_url: null,
    };
    setActiveJob(optimisticJob);
    setFullActaData(null);
    setIsUploading(true);

    try {
        const { error: insertError } = await supabase
            .from('job_instances').insert({
                id: jobId, user_id: user.id, title: capitalizeTitle(file.name), status: 'uploading' 
            });
        if (insertError) throw new Error(`Fallo al crear el registro en la base de datos: ${insertError.message}`);
        jobCreatedInDb = true; 
        
        const getSignedUrlRes = await fetch('/api/sign-gcs-upload', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ jobId: jobId, fileName: file.name, fileType: file.type })
        });
        if (!getSignedUrlRes.ok) {
            const errorBody = await getSignedUrlRes.text().catch(() => "Could not retrieve error body");
            throw new Error(`Error del servidor al firmar URL: ${getSignedUrlRes.status} - ${errorBody}`);
        }
        const { signedUrl } = await getSignedUrlRes.json();
        if (!signedUrl) throw new Error("No se recibió una URL firmada válida desde la API.");

        const uploadRes = await fetch(signedUrl, { method: 'PUT', headers: { 'Content-Type': file.type }, body: file });
        if (!uploadRes.ok) {
            const gcsErrorBody = await uploadRes.text().catch(() => "Could not retrieve error body");
            throw new Error(`Fallo la subida a GCS: ${uploadRes.status}. Detalle: ${gcsErrorBody}`);
        }
        console.log("[AppContainer] File upload to GCS complete for job " + jobId);
        
    } catch (err: any) {
        console.error("[AppContainer] Critical error in upload process:", err.message);
        setConfigError(`Error en subida: ${err.message}`); 
        if (jobCreatedInDb) await supabase.from('job_instances').delete().eq('id', jobId);
        setActiveJob(prevJob => (prevJob?.id === jobId ? null : prevJob));
    } finally {
        setIsUploading(false);
    }
  }, [user?.id, isLoadingConfig, templateData, configError]); 

  const resetProcess = useCallback(() => {
    console.log("[AppContainer] Resetting process.");
    setActiveJob(null);
    setFullActaData(null); 
    setConfigError(null); 
    setCurrentFileSize(0);
  }, []); 
  
  const handleActaUpdate = useCallback((updatedActaFromEditor: ActaData) => {
    setFullActaData(prevData => {
        if (!prevData) return null;
        return { ...prevData, ...updatedActaFromEditor };
    });

    if (activeJob) {
        const updatesForJob: Partial<Job> = {
            title: updatedActaFromEditor.title,
            summary: updatedActaFromEditor.summary,
            agreements: updatedActaFromEditor.agreements,
        };
        setActiveJob(prevJob => prevJob ? { ...prevJob, ...updatesForJob } : null);
        const supabase = createClient();
        supabase.from('job_instances').update(updatesForJob).eq('id', activeJob.id)
            .then(({ error }) => {
                if (error) console.error("[AppContainer] Error updating job instance in DB:", error);
            });
    }
  }, [activeJob]); 

  return (
    <div className="min-h-screen bg-slate-50 flex flex-col">
      <Header user={user} />
      <main className="flex-grow container mx-auto px-6 py-6 max-w-6xl">
        {isLoadingConfig && !configError && (
            <div className="text-center p-10"><p>Cargando configuración...</p></div>
        )}

        {configError && (
          <Alert variant="destructive" className="mb-4">
            <Terminal className="h-4 w-4" />
            <AlertTitle>Error de Configuración o Proceso</AlertTitle>
            <AlertDescription>
                {configError}
                {configError.includes("plantilla") && (
                    <Button variant="link" className="p-0 h-auto ml-1" onClick={() => window.location.reload()}>
                        Reintentar carga.
                    </Button>
                )}
            </AlertDescription>
          </Alert>
        )}
        
        {!isLoadingConfig && !activeJob && !configError && ( 
          <AudioUpload onFileUpload={handleFileUpload} disabled={isUploading || !templateData} />
        )}

        {activeJob && activeJob.status !== 'complete' && activeJob.status !== 'error' && (
          <ProcessingView 
            step={activeJob.status} 
            progress={mapStatusToProgress(activeJob.status)} 
            fileName={activeJob.title} 
            fileSize={currentFileSize} 
          />
        )}
        
        {activeJob && activeJob.status === 'error' && ( 
             <Alert variant="destructive" className="mb-4">
                <Terminal className="h-4 w-4" />
                <AlertTitle>Error en el Procesamiento</AlertTitle>
                <AlertDescription>
                    El trabajo "{activeJob.title}" encontró un error. 
                    <Button variant="link" className="p-0 h-auto ml-1" onClick={resetProcess}>
                        Intentar con un nuevo archivo.
                    </Button>
                </AlertDescription>
            </Alert>
        )}

        {fullActaData && activeJob && activeJob.status === 'complete' && (
          <ActaEditor 
            actaData={fullActaData} 
            onReset={resetProcess} 
            onUpdate={handleActaUpdate} 
            isLoadingExtraData={isLoadingExtraData} 
          />
        )}
        
        {activeJob && activeJob.status === 'complete' && !fullActaData && (isLoadingExtraData || !fullActaData) && (
             <div className="text-center p-10"><p>Cargando datos finales del acta...</p></div>
        )}
      </main>
      <Footer />
    </div>
  )
}