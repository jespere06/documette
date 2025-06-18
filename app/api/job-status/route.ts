// src/app/api/job-status/route.ts

import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server'; // Usamos el cliente SSR que respeta RLS

export async function GET(req: Request) {
  // Nota: createClient() aquí usa el que definiste para SSR con cookies
  const supabase = await createClient(); 

  const { data: { user } } = await supabase.auth.getUser();

  // 1. Proteger el endpoint: si no hay usuario, no hay acceso
  if (!user) {
    return NextResponse.json({ error: 'No autorizado' }, { status: 401 });
  }

  const { searchParams } = new URL(req.url);
  const jobId = searchParams.get('id');

  if (!jobId) {
    return NextResponse.json({ error: 'Falta el ID del trabajo (id).' }, { status: 400 });
  }

  try {
    // 2. Consultar el trabajo. RLS se encarga de la seguridad.
    // La política que creamos ("Los usuarios pueden ver sus propios trabajos")
    // filtrará automáticamente para que solo devuelva un resultado si auth.uid() === user_id.
    const { data: job, error } = await supabase
      .from('processing_jobs')
      .select('status, error_message, result_doc_url, markdown_result')
      .eq('id', jobId)
      .single(); // .single() dará error si no encuentra una fila (o más de una)

    if (error) {
      console.warn(`[job-status] Fallo la consulta para el job ${jobId} del usuario ${user.id}:`, error.message);
      // 'PGRST116' es el código de Supabase/PostgREST para "no se encontró la fila"
      if (error.code === 'PGRST116') {
        return NextResponse.json({ error: 'Trabajo no encontrado o no tienes permiso para verlo.' }, { status: 404 });
      }
      // Para otros errores de base de datos
      throw error;
    }

    // 3. Devolver los datos del trabajo
    return NextResponse.json(job);

  } catch (error) {
    console.error(`[job-status] Error grave consultando el trabajo ${jobId}:`, error);
    const errorMessage = error instanceof Error ? error.message : 'Error interno al consultar el estado del trabajo.';
    return NextResponse.json({ error: errorMessage }, { status: 500 });
  }
}