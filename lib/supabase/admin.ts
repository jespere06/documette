// src/lib/supabase/admin.ts

import { createClient } from '@supabase/supabase-js'

// Asegúrate de que las variables de entorno estén definidas.
// Si no lo están, la aplicación fallará al iniciar, lo cual es bueno
// para detectar errores de configuración temprano.
if (!process.env.NEXT_PUBLIC_SUPABASE_URL) {
  throw new Error("Missing env.NEXT_PUBLIC_SUPABASE_URL");
}
if (!process.env.NEXT_SUPABASE_SERVICE_ROLE) {
  throw new Error("Missing env.NEXT_SUPABASE_SERVICE_ROLE");
}

/**
 * Crea un cliente de Supabase con privilegios de administrador (service_role).
 * Este cliente DEBE usarse únicamente en el lado del servidor (rutas de API, Server Actions)
 * y NUNCA en el lado del cliente o en componentes de cliente.
 * Ignora las políticas de Row Level Security (RLS).
 */
export const createAdminClient = () => {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_SUPABASE_SERVICE_ROLE!,
    {
      auth: {
        // Estas opciones son importantes para un cliente de servidor
        autoRefreshToken: false,
        persistSession: false,
      },
    }
  );
};