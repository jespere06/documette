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

    let actaIdFromRequest: string | null = null;

    try {
        const { actaId, diarizedTranscript, summary, speakers } = await req.json();
        actaIdFromRequest = actaId;

        if (!actaId || !diarizedTranscript || !summary || !speakers) {
            console.error("Payload incompleto recibido en /api/identify-speakers-callback.", { actaId });
            return NextResponse.json({ error: "Faltan datos en el payload del callback." }, { status: 400 });
        }

        console.log(`[Callback Intermedio] Datos recibidos para el acta: ${actaId}`);

        // 1. Actualizar la base de datos
        const supabase = createAdminClient();
        console.log(`[Callback Intermedio] Actualizando acta ${actaId} con status 'diarized'.`);
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

        // 2. Disparar el siguiente paso con logging robusto
        const targetUrl = process.env.CLOUD_RUN_GENERATE_URL;
        const secretToken = process.env.CLOUD_RUN_SECRET;

        if (!targetUrl || !secretToken) {
            throw new Error("Las variables de entorno CLOUD_RUN_GENERATE_URL o CLOUD_RUN_SECRET no están configuradas.");
        }

        const fetchOptions: RequestInit = {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${secretToken}`
            },
            body: JSON.stringify({ actaId: actaId })
        };
        
        // Log de depuración antes de la llamada
        console.log(`[Callback Intermedio] Disparando a: ${targetUrl}`);
        console.log(`[Callback Intermedio] Con Payload: ${fetchOptions.body}`);

        // Llamada "fire-and-forget" con manejo de errores y respuestas
        fetch(targetUrl, fetchOptions)
            .then(async (res) => {
                // Logueamos el status de la respuesta SIEMPRE
                console.log(`[Callback Intermedio] /generate-acta respondió con status: ${res.status}`);
                if (!res.ok) {
                    // Si la respuesta no es 2xx, es un error del servidor de Cloud Run
                    const errorBody = await res.text();
                    console.error(`[Callback Intermedio] Cuerpo del error de /generate-acta:`, errorBody);
                    // Marcar el acta como error en la DB para notificar al usuario
                    const supabaseErrorClient = createAdminClient();
                    await supabaseErrorClient.from('actas').update({ status: 'error', summary: `Llamada a generate-acta falló con status ${res.status}` }).eq('id', actaId);
                }
            })
            .catch(err => {
                // Captura errores de red (ej. ECONNRESET, no se puede resolver el DNS, etc.)
                console.error(`[Callback Intermedio] Error de red al invocar /generate-acta:`, (err as Error).message);
                const supabaseErrorClient = createAdminClient();
                supabaseErrorClient.from('actas').update({ status: 'error', summary: `Error de red al llamar a generate-acta` }).eq('id', actaId);
            });
        
        // 3. Devolvemos la respuesta inmediatamente.
        console.log("[Callback Intermedio] Llamada a /generate-acta disparada. Respondiendo 200 OK.");
        return NextResponse.json({ success: true, message: "Siguiente paso iniciado." });

    } catch (error: any) {
        console.error("[Callback Intermedio] Error fatal en el bloque principal:", error.message);
        
        if (actaIdFromRequest) {
            const supabase = createAdminClient();
            await supabase.from('actas').update({ status: 'error', summary: `Fallo en callback de diarización: ${error.message}` }).eq('id', actaIdFromRequest);
        }
        
        return NextResponse.json({ error: "Internal Server Error", details: error.message }, { status: 500 });
    }
}