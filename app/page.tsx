// app/page.tsx
import { createClient } from "@/lib/supabase/server";
import { redirect } from "next/navigation";
// --- CORRECCIÓN AQUÍ ---
// Se importa 'AppContainer' directamente
import { AppContainer } from "@/components/app-container";

// El estado del proceso ahora es el 'status' de la tabla de trabajos
// Definición final del tipo JobStatus (orden lógico por etapa)

export type JobStatus =
  // 1. Estados iniciales (manejados por el cliente/frontend)
  | "uploading"      // El cliente está subiendo el archivo de audio.
  | "uploaded"       // El archivo ya está en GCS, listo para ser procesado.

  // 2. Etapa de Transcripción
  | "transcribing"   // El servicio 'transcribe' está procesando el audio.
  | "transcribed"    // El servicio 'transcribe' ha finalizado y guardado la transcripción.

  // 3. Etapa de Identificación y Análisis (Diarización)
  | "diarizing"      // El servicio 'identify-speakers' está analizando la transcripción.
  | "diarized"       // El servicio 'identify-speakers' ha finalizado la extracción de datos.

  // 4. Etapa de Generación de Markdown
  | "generating"     // El servicio 'markdown-generate' está creando el documento.
  | "generated"      // El servicio 'markdown-generate' ha finalizado y guardado el markdown.

  // 5. Etapa Final de Generación de DOCX
  | "docxing"        // El servicio 'docx-generate' está creando el archivo .docx.
  | "complete"       // ¡Éxito! Todo el proceso ha terminado y el .docx está listo.

  // Estado de Fallo General
  | "error";         // Ocurrió un error en cualquier punto del proceso.

// Este tipo debe coincidir con la estructura de tu tabla 'job_instances'
// y/o el ENUM type en tu base de datos si estás usando uno.
export interface JobInstance {
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

// Interfaz Speaker simplificada para que coincida con lo que guarda Gemini
export interface Speaker {
  name: string;
  role: string;
}

export interface ActaData {
  title: string;
  date: string;
  participants: string[];
  speakers: Speaker[];
  summary: string;
  agreements: string[];
  transcript: string;
  docUrl: string;
  duration: number;
}

export default async function Home() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()

  if (!user) {
    redirect("/login")
  }

  // --- CORRECCIÓN AQUÍ ---
  // Se usa 'AppContainer' directamente
  return <AppContainer user={user} />
}