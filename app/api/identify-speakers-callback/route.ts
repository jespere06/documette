// ruta: app/api/identify-speakers-callback/route.ts

import { NextResponse, NextRequest } from 'next/server';
import { createAdminClient } from '@/lib/supabase/admin';

export const dynamic = "force-dynamic";

export async function POST(req: NextRequest) {
    // 1. Verificación de Seguridad
    const secret = req.nextUrl.searchParams.get('secret');
    if (secret !== process.env.CALLBACK_SECRET) {
        console.warn("Llamada a callback de 'identify-speakers' con secreto inválido.");
        return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    try {
        // 2. Extraer los datos del cuerpo de la petición.
        const { actaId, diarizedTranscript, summary, speakers } = await req.json();

        // Validar que tenemos todo lo que necesitamos.
        if (!actaId || !diarizedTranscript || !summary || !speakers) {
            console.error("Payload incompleto recibido en el callback de 'identify-speakers':", { actaId });
            return NextResponse.json({ error: "Faltan datos en el payload del callback." }, { status: 400 });
        }

        console.log(`[Callback Intermedio] Datos de diarización recibidos para el acta: ${actaId}`);

        // 3. Actualizar la base de datos con los datos recibidos.
        const supabase = await createAdminClient();
        console.log(`[Callback Intermedio] Actualizando acta ${actaId} en Supabase con status 'diarized'.`);
        
        const { error: updateError } = await supabase
            .from('actas')
            .update({
                diarized_transcript: diarizedTranscript,
                summary: summary,
                speakers: speakers,
                status: 'diarized' // Actualizamos el estado para notificar al cliente vía Realtime del progreso.
            })
            .eq('id', actaId);
        
        if (updateError) {
            throw new Error(`Error al actualizar el acta ${actaId} en Supabase: ${updateError.message}`);
        }

        // 4. Disparar el SIGUIENTE paso: la generación del acta en Cloud Run.
        // Aquí usamos la variable de entorno que apunta al segundo servicio de Cloud Run.
        if (!process.env.CLOUD_RUN_GENERATE_URL || !process.env.CLOUD_RUN_SECRET) {
            throw new Error("Las variables de entorno para el servicio 'generate-acta' no están configuradas.");
        }

        console.log(`[Callback Intermedio] Disparando proceso de generación de acta en Cloud Run para: ${actaId}`);
        // Hacemos la llamada y no esperamos la respuesta ("fire-and-forget").
        fetch(process.env.CLOUD_RUN_GENERATE_URL, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${process.env.CLOUD_RUN_SECRET}`
            },
            body: JSON.stringify({ actaId: actaId })
        }).catch(err => {
            // Es importante capturar el error aquí para que no rompa la respuesta a Cloud Run.
            console.error(`[Callback Intermedio] Fallo al invocar /generate-acta para ${actaId}:`, err);
        });

        // 5. Responder a la llamada de Cloud Run ('identify-speakers') con un 200 OK.
        return NextResponse.json({ success: true, message: "Callback de diarización procesado y siguiente paso (generación de acta) iniciado." });

    } catch (error: any) {
        console.error("[Callback Intermedio] Error fatal procesando el callback de 'identify-speakers':", error.message);
        
        // Intentar marcar el acta como errónea.
        try {
            const { actaId } = await req.clone().json();
            if (actaId) {
                const supabase = await createAdminClient();
                await supabase
                    .from('actas')
                    .update({ status: 'error', summary: 'Fallo durante el callback de diarización.' })
                    .eq('id', actaId);
            }
        } catch (e) {
            console.error("[Callback Intermedio] No se pudo ni siquiera marcar el acta como errónea:", e);
        }
        
        return NextResponse.json({ error: "Internal Server Error", details: error.message }, { status: 500 });
    }
}