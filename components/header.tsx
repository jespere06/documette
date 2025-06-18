// app/components/header.tsx
"use client"

import Image from "next/image"
import { useRouter } from "next/navigation" // -> 1. Importamos el router
import { Button } from "@/components/ui/button"
import { LogOut, User } from "lucide-react"
import { createClient } from "@/lib/supabase/client" // -> 2. Importamos el cliente de Supabase
import type { User as SupabaseUser } from "@supabase/supabase-js" // -> 3. Importamos el tipo de usuario

// -> 4. Las props ahora reciben el objeto de usuario completo o null
interface HeaderProps {
  user: SupabaseUser | null
}

export function Header({ user }: HeaderProps) {
  const router = useRouter()
  const supabase = createClient()

  // -> 5. Creamos la función de logout
  const handleLogout = async () => {
    await supabase.auth.signOut()
    // Redirigimos al usuario a la página de login y refrescamos el estado del servidor
    router.push("/login")
    router.refresh()
  }

  return (
    <header className="border-b border-slate-200 bg-white sticky top-0 z-50">
      <div className="container mx-auto px-4 py-3 max-w-6xl">
        <div className="flex items-center justify-between">
          <div className="flex items-center space-x-3">
            <div className="relative">
              <Image src="/logo.svg" alt="Documette" width={32} height={32} className="w-8 h-8" />
            </div>
            <div>
              <h1 className="text-xl font-medium text-slate-800 tracking-wide">Documette</h1>
              <p className="text-sm text-slate-500 -mt-0.5 font-light">Actas profesionales</p>
            </div>
          </div>

          {/* -> 6. Solo mostramos la información del usuario y el botón de salir si hay un usuario logueado */}
          {user && (
            <div className="flex items-center space-x-4">
              <div className="flex items-center space-x-2 text-sm text-slate-600">
                <User className="w-4 h-4" />
                <span className="font-light">{user.email}</span>
              </div>

              <Button
                variant="outline"
                size="sm"
                onClick={handleLogout} // -> 7. El botón ahora llama a nuestra nueva función
                className="border-slate-300 hover:border-slate-400 text-slate-600 hover:text-slate-800"
              >
                <LogOut className="w-4 h-4 mr-2" />
                Salir
              </Button>
            </div>
          )}
        </div>
      </div>
    </header>
  )
}