// ruta: app/api/identify-speakers-callback/route.ts

import { NextResponse, NextRequest } from 'next/server';
import { createAdminClient } from '@/lib/supabase/admin';

export const dynamic = "force-dynamic";

// [NUEVA FUNCIÓN DE UTILIDAD CON REINTENTOS]
// Esta función intentará hacer un fetch varias veces si encuentra errores de red o de servidor.
async function fetchWithRetries(url: string, options: RequestInit, retries = 4, delay = 1000): Promise<Response> {
  for (let i = 0; i < retries; i++) {
    try {
      console.log(`[fetchWithRetries] Intento ${i + 1}/${retries} para llamar a ${url}`);
      const response = await fetch(url, options);

      // Si la respuesta es OK (2xx) o un error de cliente (4xx), no reintentamos.
      // Solo reintentamos en errores de servidor (5xx) o de red.
      if (response.ok || response.status < 500) {
        return response; // Éxito o error no recuperable, devolvemos la respuesta.
      }
      console.warn(`[fetchWithRetries] Falló con status ${response.status}. Reintentando...`);

    } catch (error: any) {
      // Capturamos errores de red como ECONNRESET
      console.warn(`[fetchWithRetries] Falló con error de red: ${error.message}. Reintentando...`);
    }

    // Si no es el último intento, esperamos antes de reintentar.
    if (i < retries - 1) {
      const waitTime = delay * Math.pow(2, i); // 1s, 2s, 4s...
      console.log(`[fetchWithRetries] Esperando ${waitTime}ms para el siguiente intento.`);
      await new Promise(res => setTimeout(res, waitTime));
    }
  }
  // Si después de todos los intentos no se pudo, lanzamos un error definitivo.
  throw new Error(`No se pudo completar la petición a ${url} después de ${retries} intentos.`);
}


export async function POST(req: NextRequest) {
    const secret = req.nextUrl.searchParams.get('secret');
    if (secret !== process.env.CALLBACK_SECRET) {
        console.warn("Llamada a callback de 'identify-speakers' con secreto inválido.");
        return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    let actaId: string | null = null;

    try {
        const { diarizedTranscript, summary, speakers } = await req.json();
        // Leemos el actaId desde el cuerpo por si acaso, pero también lo podemos obtener del tag si lo pasamos
        actaId = (req as any).body?.actaId || (await req.clone().json()).actaId;

        if (!actaId || !diarizedTranscript || !summary || !speakers) {
            console.error("Payload incompleto recibido en el callback de 'identify-speakers':", { actaId });
            return NextResponse.json({ error: "Faltan datos en el payload del callback." }, { status: 400 });
        }

        console.log(`[Callback Intermedio] Datos de diarización recibidos para el acta: ${actaId}`);

        // 1. Actualizar la base de datos
        const supabase = createAdminClient();
        console.log(`[Callback Intermedio] Actualizando acta ${actaId} en Supabase con status 'diarized'.`);
        const { error: updateError } = await supabase
            .from('actas')
            .update({ diarized_transcript: diarizedTranscript, summary: summary, speakers: speakers, status: 'diarized' })
            .eq('id', actaId);
        
        if (updateError) {
            throw new Error(`Error al actualizar el acta ${actaId} en Supabase: ${updateError.message}`);
        }
        console.log(`[Callback Intermedio] Supabase actualizado. Acta ${actaId} ahora en estado 'diarized'.`);

        // 2. Disparar el SIGUIENTE paso con reintentos
        if (!process.env.CLOUD_RUN_GENERATE_URL || !process.env.CLOUD_RUN_SECRET) {
            throw new Error("Las variables de entorno para el servicio 'generate-acta' no están configuradas.");
        }

        const fetchOptions: RequestInit = {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${process.env.CLOUD_RUN_SECRET}`
            },
            body: JSON.stringify({ actaId: actaId })
        };

        console.log(`[Callback Intermedio] Disparando proceso a /generate-acta para el acta: ${actaId}`);
        const cloudRunResponse = await fetchWithRetries(process.env.CLOUD_RUN_GENERATE_URL, fetchOptions);

        if (!cloudRunResponse.ok) {
            // Si incluso después de los reintentos falla, lanzamos un error para que sea capturado y logueado.
            const errorBody = await cloudRunResponse.text();
            throw new Error(`La llamada a /generate-acta falló después de los reintentos. Status: ${cloudRunResponse.status}. Body: ${errorBody}`);
        }
        
        console.log("[Callback Intermedio] Llamada a /generate-acta enviada exitosamente.");
        return NextResponse.json({ success: true, message: "Callback de diarización procesado y siguiente paso iniciado." });

    } catch (error: any) {
        console.error("[Callback Intermedio] Error fatal procesando el callback de 'identify-speakers':", error.message);
        
        if (actaId) {
            const supabase = createAdminClient();
            await supabase.from('actas').update({ status: 'error', summary: `Fallo en callback de diarización: ${error.message}` }).eq('id', actaId);
        }
        
        return NextResponse.json({ error: "Internal Server Error", details: error.message }, { status: 500 });
    }
}