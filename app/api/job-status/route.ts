// src/app/api/job-status/route.ts

import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';

export async function GET(req: Request) {
  const supabase = await createClient(); 

  const { data: { user } } = await supabase.auth.getUser();

  // 1. Proteger el endpoint
  if (!user) {
    return NextResponse.json({ error: 'No autorizado' }, { status: 401 });
  }

  const { searchParams } = new URL(req.url);
  const jobId = searchParams.get('id');

  if (!jobId) {
    return NextResponse.json({ error: 'Falta el ID del trabajo (id).' }, { status: 400 });
  }

  try {
    // 2. Consultar el trabajo con TODOS los campos necesarios para el frontend
    const { data: job, error } = await supabase
      .from('processing_jobs')
      .select(`
        status,
        error_message,
        markdown_result,
        speakers,
        summary,
        agreements,
        diarized_transcript
      `)
      .eq('id', jobId)
      .single();

    if (error) {
      console.warn(`[job-status] Fallo la consulta para el job ${jobId} del usuario ${user.id}:`, error.message);
      if (error.code === 'PGRST116') {
        return NextResponse.json({ error: 'Trabajo no encontrado o no tienes permiso para verlo.' }, { status: 404 });
      }
      throw error;
    }

    // 3. Devolver el objeto completo con todos los datos
    return NextResponse.json(job);

  } catch (error) {
    console.error(`[job-status] Error grave consultando el trabajo ${jobId}:`, error);
    const errorMessage = error instanceof Error ? error.message : 'Error interno al consultar el estado del trabajo.';
    return NextResponse.json({ error: errorMessage }, { status: 500 });
  }
}