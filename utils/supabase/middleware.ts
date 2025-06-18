// utils/supabase/middleware.ts
import { createServerClient } from '@supabase/ssr'
import { NextResponse, type NextRequest } from 'next/server'

export async function updateSession(request: NextRequest) {
  // Inicializamos la respuesta que devolveremos al final
  let response = NextResponse.next({ request })

  // Creamos el cliente Supabase adaptado a cookies de Next.js
  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll: () => request.cookies.getAll(),
        setAll: (cookiesToSet) => {
          // Primero, actualizamos el objeto request (para Server Components posteriores)
          cookiesToSet.forEach(({ name, value, options }) => {
            request.cookies.set(name, value)
          })
          // Luego, actualizamos la respuesta HTTP real que saldrá al navegador
          cookiesToSet.forEach(({ name, value, options }) =>
            response.cookies.set(name, value, options)
          )
        },
      },
    }
  )

  // Muy importante: justo aquí llamamos para refrescar la sesión
  const { data: { user } } = await supabase.auth.getUser()

  // Si no hay usuario y la ruta no es /login ni /auth/*, redirigimos
  if (
    !user &&
    !request.nextUrl.pathname.startsWith('/login') &&
    !request.nextUrl.pathname.startsWith('/auth')
  ) {
    const url = request.nextUrl.clone()
    url.pathname = '/login'
    return NextResponse.redirect(url)
  }

  return response
}
