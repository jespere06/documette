// app/components/login.tsx
"use client"

import type React from "react"

import { useState } from "react"
import { useRouter } from "next/navigation" // -> 1. Importamos el router para redirigir
import { createClient } from "@/lib/supabase/client" // -> 2. Importamos nuestro cliente de Supabase

import { Button } from "@/components/ui/button"
import { Card } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { useToast } from "@/hooks/use-toast" // -> 3. Importamos el hook de notificaciones
import { Mail, Lock, ArrowRight } from "lucide-react"
import Image from "next/image"

// -> 4. Ya no necesitamos recibir props como `onLogin`
export function Login() {
  const router = useRouter()
  const supabase = createClient()
  const { toast } = useToast()

  const [email, setEmail] = useState("")
  const [password, setPassword] = useState("")
  const [isLoading, setIsLoading] = useState(false)

  // -> 5. La función handleSubmit ahora es asíncrona y habla con Supabase
  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!email || !password) return

    setIsLoading(true)

    // Lógica de autenticación real con Supabase
    const { error } = await supabase.auth.signInWithPassword({
      email,
      password,
    })

    // Si Supabase devuelve un error, lo mostramos
    if (error) {
      toast({
        title: "Error al iniciar sesión",
        description: "Tus credenciales son incorrectas. Por favor, inténtalo de nuevo.",
        variant: "destructive",
      })
      setIsLoading(false) // Detenemos la carga para que el usuario pueda reintentar
      return // Salimos de la función
    }

    // Si el login es exitoso, redirigimos a la página principal
    // y refrescamos para que el servidor reconozca la nueva sesión.
    router.push("/")
    router.refresh()
  }

  return (
    <div className="min-h-screen bg-slate-50 flex items-center justify-center p-4">
      <div className="w-full max-w-md space-y-8">
        {/* Header */}
        <div className="text-center space-y-4">
          <div className="flex items-center justify-center space-x-3">
            <div className="relative">
              <Image src="/logo.svg" alt="Documette" width={40} height={40} className="w-10 h-10" />
            </div>
            <div>
              <h1 className="text-2xl font-medium text-slate-900 tracking-wide">Documette</h1>
              <p className="text-sm text-slate-600 -mt-1 font-light">Actas profesionales</p>
            </div>
          </div>

          <div className="space-y-2">
            <h2 className="text-xl font-light text-slate-800">Accede a tu cuenta</h2>
            <p className="text-slate-600 font-light">Inicia sesión para generar actas profesionales</p>
          </div>
        </div>

        {/* Login Form */}
        <Card className="p-6 bg-white border-slate-200">
          <form onSubmit={handleSubmit} className="space-y-4">
            <div className="space-y-2">
              <label htmlFor="email" className="block text-sm font-medium text-slate-700">
                Correo electrónico
              </label>
              <div className="relative">
                <Mail className="absolute left-3 top-1/2 transform -translate-y-1/2 w-4 h-4 text-slate-400" />
                <Input
                  id="email"
                  type="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="tu@empresa.com"
                  className="pl-10 border-slate-300 focus:border-slate-500 focus:ring-slate-500"
                  required
                />
              </div>
            </div>

            <div className="space-y-2">
              <label htmlFor="password" className="block text-sm font-medium text-slate-700">
                Contraseña
              </label>
              <div className="relative">
                <Lock className="absolute left-3 top-1/2 transform -translate-y-1/2 w-4 h-4 text-slate-400" />
                <Input
                  id="password"
                  type="password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder="••••••••"
                  className="pl-10 border-slate-300 focus:border-slate-500 focus:ring-slate-500"
                  required
                />
              </div>
            </div>

            <Button
              type="submit"
              disabled={isLoading || !email || !password}
              className="w-full bg-slate-800 hover:bg-slate-900 text-white font-medium py-2.5 disabled:opacity-50"
            >
              {isLoading ? (
                <div className="flex items-center justify-center space-x-2">
                  <div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin"></div>
                  <span>Verificando...</span>
                </div>
              ) : (
                <div className="flex items-center justify-center space-x-2">
                  <span>Iniciar sesión</span>
                  <ArrowRight className="w-4 h-4" />
                </div>
              )}
            </Button>
          </form>

          <div className="mt-4 text-center">
            <button className="text-sm text-slate-600 hover:text-slate-800 font-light">
              ¿Olvidaste tu contraseña?
            </button>
          </div>
        </Card>

        {/* Demo Notice -> Puedes eliminar esto o conservarlo */}
        <div className="bg-blue-50 border border-blue-200 rounded-lg p-4">
          <div className="text-center space-y-2">
            <h3 className="text-sm font-medium text-blue-900">Demo</h3>
            <p className="text-xs text-blue-700 font-light">
              Usa un email y contraseña válidos de tu cuenta de Supabase.
            </p>
          </div>
        </div>

        {/* Footer */}
        <div className="text-center text-xs text-slate-500 font-light">
          © 2024 Documette. Procesamiento seguro y confidencial.
        </div>
      </div>
    </div>
  )
}