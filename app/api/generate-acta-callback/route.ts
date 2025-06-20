// ruta: app/api/identify-speakers-callback/route.ts

import { NextResponse, NextRequest } from 'next/server';
import { createAdminClient } from '@/lib/supabase/admin';

export const dynamic = "force-dynamic";

export async function POST(req: NextRequest) {
    const secret = req.nextUrl.searchParams.get('secret');
    if (secret !== process.env.CALLBACK_SECRET) {
        console.warn("Llamada a callback de 'identify-speakers' con secreto inválido.");
        return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    let receivedActaId: string | null = null;

    try {
        // [CORRECCIÓN CLAVE] Leemos el cuerpo de la petición UNA SOLA VEZ y guardamos los datos.
        const { actaId, diarizedTranscript, summary, speakers } = await req.json();
        receivedActaId = actaId; // Guardamos el ID para usarlo en el bloque catch si es necesario.

        // Validamos que tenemos todo lo que necesitamos.
        if (!actaId || !diarizedTranscript || !summary || !speakers) {
            console.error("Payload incompleto recibido en el callback de 'identify-speakers'. Datos recibidos:", { actaId, diarizedTranscript, summary, speakers });
            return NextResponse.json({ error: "Faltan datos en el payload del callback." }, { status: 400 });
        }

        console.log(`[Callback Intermedio] Datos de diarización recibidos para el acta: ${actaId}`);

        // 1. Actualizar la base de datos
        const supabase = createAdminClient();
        console.log(`[Callback Intermedio] Actualizando acta ${actaId} en Supabase con status 'diarized'.`);
        const { error: updateError } = await supabase
            .from('actas')
            .update({
                diarized_transcript: diarizedTranscript,
                summary: summary,
                speakers: speakers,
                status: 'diarized'
            })
            .eq('id', actaId);
        
        if (updateError) {
            throw new Error(`Error al actualizar el acta ${actaId} en Supabase: ${updateError.message}`);
        }
        console.log(`[Callback Intermedio] Supabase actualizado.`);

        // 2. Disparar el siguiente paso en Cloud Run
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
        // Hacemos la llamada sin reintentos por ahora para simplificar, ya que aumentamos el timeout.
        const cloudRunResponse = await fetch(process.env.CLOUD_RUN_GENERATE_URL, fetchOptions);

        if (!cloudRunResponse.ok) {
            const errorBody = await cloudRunResponse.text();
            throw new Error(`La llamada a /generate-acta falló. Status: ${cloudRunResponse.status}. Body: ${errorBody}`);
        }
        
        console.log("[Callback Intermedio] Llamada a /generate-acta enviada exitosamente.");
        return NextResponse.json({ success: true, message: "Siguiente paso iniciado." });

    } catch (error: any) {
        console.error("[Callback Intermedio] Error fatal:", error.message);
        
        if (receivedActaId) {
            const supabase = createAdminClient();
            await supabase.from('actas').update({ status: 'error', summary: `Fallo en callback de diarización: ${error.message}` }).eq('id', receivedActaId);
        }
        
        return NextResponse.json({ error: "Internal Server Error", details: error.message }, { status: 500 });
    }
}