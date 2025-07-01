// app/page.tsx
import { createClient } from "@/lib/supabase/server";
import { redirect } from "next/navigation";
// --- CORRECCIÓN AQUÍ ---
// Se importa 'AppContainer' directamente
import { AppContainer } from "@/components/app-container";

// El estado del proceso ahora es el 'status' de la tabla de trabajos
export type JobStatus = "downloading" | "uploading" | "uploaded" | "transcribed" | "diarized" | "generated" | "complete" | "error";

// Este tipo debe coincidir con la estructura de tu tabla 'job_instances'
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