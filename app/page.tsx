// app/page.tsx
import { createClient } from "@/lib/supabase/server"
import { redirect } from "next/navigation"
import { AppContainer } from "@/components/app-container"

export type ProcessingStep = "upload" | "transcribing" | "diarizing" | "generating" | "complete"

export interface Speaker {
  id: string
  name: string
  segments: Array<{
    text: string
    start: number
    end: number
  }>
}

export interface ActaData {
  title: string
  date: string
  participants: string[]
  speakers: Speaker[]
  summary: string
  agreements: string[]
  transcript: string
  duration: number
  markdown: string
  docUrl: string
}


export default async function Home() {
  const supabase = await createClient() // ✅ sin await

  const {
    data: { user },
  } = await supabase.auth.getUser()

  if (!user) {
    redirect("/login")
  }

  return <AppContainer user={user} />
}
