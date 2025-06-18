// app/layout.tsx
import type { Metadata } from "next"
import { Inter } from "next/font/google"
import "./globals.css"
import { ThemeProvider } from "@/components/theme-provider"
import { Toaster } from "@/components/ui/toaster" // -> 1. Importamos el Toaster para notificaciones

const inter = Inter({ subsets: ["latin"], variable: "--font-sans" })

export const metadata: Metadata = {
  title: "Documette - Actas Profesionales",
  description: "Genera actas de reunión profesionales a partir de audio.",
}

// -> 2. Hacemos que el layout sea dinámico para asegurar que
// siempre lea el estado más reciente de la cookie de sesión.
export const dynamic = "force-dynamic"

export default function RootLayout({
  children,
}: {
  children: React.ReactNode
}) {
  return (
    <html lang="es" suppressHydrationWarning>
      <body className={inter.className}>
        {/* -> 3. Envolvemos la app en el ThemeProvider para temas (claro/oscuro) */}
        <ThemeProvider
          attribute="class"
          defaultTheme="light"
          enableSystem
          disableTransitionOnChange
        >
          {children}
          {/* -> 4. Colocamos el Toaster al final para que pueda mostrarse en toda la app */}
          <Toaster />
        </ThemeProvider>
      </body>
    </html>
  )
}