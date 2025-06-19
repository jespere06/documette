// app/login/page.tsx  <-- sin "use client"
import { createClient } from "@/lib/supabase/server"
import { redirect } from "next/navigation"
import { Login } from "@/components/login"

export default async function LoginPage() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (user) {
    redirect("/")         // ya logueado, vamos al home
  }
  return <Login />    // si no, mostramos el formulario
}
