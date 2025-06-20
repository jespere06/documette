// ruta: app/api/transcribe-callback/route.ts

import { NextResponse, NextRequest } from 'next/server';
import { createAdminClient } from '@/lib/supabase/admin';

export const dynamic = "force-dynamic";

export async function POST(req: NextRequest) {
    console.log("==========================================================");
    console.log("[Callback] Recibida nueva notificación de Deepgram.");
    
    // 1. Verificación de Seguridad
    const secret = req.nextUrl.searchParams.get('secret');
    if (secret !== process.env.CALLBACK_SECRET) {
        console.error("[Callback] Secreto de callback inválido.");
        return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    let actaId: string | null = null;
    
    try {
        const notificationPayload = await req.json();
        actaId = notificationPayload.metadata?.tags?.[0];

        if (!actaId) {
            throw new Error("No se encontró 'actaId' en los metadatos del callback.");
        }
        console.log(`[Callback] Notificación para el actaId: ${actaId}`);

        // 2. Obtener el request_id y la API key desde nuestra DB
        const supabase = createAdminClient();
        console.log(`[Callback] Obteniendo datos del acta ${actaId} desde Supabase...`);
        
        const { data: actaData, error: fetchError } = await supabase
            .from('actas')
            .select(`
                deepgram_request_id,
                user:user_id (
                    templates (
                        deepgram_api_key
                    )
                )
            `)
            .eq('id', actaId)
            .single();

        if (fetchError || !actaData) {
            throw new Error(`No se pudo encontrar el acta o su request_id en Supabase: ${fetchError?.message}`);
        }
        
        const requestId = actaData.deepgram_request_id;
        // Navegamos por la estructura del JSON para obtener la clave
        const deepgram_api_key = (actaData.user as any)?.templates?.deepgram_api_key;

        if (!requestId || !deepgram_api_key) {
             throw new Error("No se encontró el request_id de Deepgram o la API key para el acta.");
        }
        
        console.log(`[Callback] Request ID obtenido: ${requestId}. Obteniendo resultados de Deepgram...`);

        // 3. Llamar a la API de resultados de Deepgram para obtener la transcripción
        const resultsUrl = `https://api.deepgram.com/v1/requests/${requestId}`;
        const resultsResponse = await fetch(resultsUrl, {
            headers: {
                'Authorization': `Token ${deepgram_api_key}`
            }
        });

        if (!resultsResponse.ok) {
            const errorBody = await resultsResponse.json();
            throw new Error(`Error al obtener los resultados de Deepgram: ${errorBody.err_msg || resultsResponse.statusText}`);
        }

        const deepgramResultPayload = await resultsResponse.json();

        // 4. Formatear la transcripción (misma lógica de antes)
        let formattedTranscription = "";
        const words = deepgramResultPayload.results?.channels?.[0]?.alternatives?.[0]?.words;
        if (words && Array.isArray(words)) {
            let currentSpeaker: number | null = null;
            let currentUtteranceBlock = "";
            for (const wordInfo of words) {
                const speaker = wordInfo.speaker;
                if (speaker === undefined) { currentUtteranceBlock += wordInfo.word + " "; continue; }
                if (currentSpeaker === null) { currentSpeaker = speaker; }
                if (speaker !== currentSpeaker) {
                    if (currentUtteranceBlock.trim() !== "") { formattedTranscription += `[Speaker:${currentSpeaker}] ${currentUtteranceBlock.trim()}\n`; }
                    currentSpeaker = speaker;
                    currentUtteranceBlock = "";
                }
                currentUtteranceBlock += wordInfo.word + " ";
            }
            if (currentUtteranceBlock.trim() !== "" && currentSpeaker !== null) {
                formattedTranscription += `[Speaker:${currentSpeaker}] ${currentUtteranceBlock.trim()}`;
            }
        } else {
            formattedTranscription = deepgramResultPayload.results?.channels?.[0]?.alternatives?.[0]?.transcript || "Transcripción no disponible.";
        }
        console.log(`[Callback] Transcripción obtenida y formateada. Longitud: ${formattedTranscription.length}`);

        // 5. Actualizar la base de datos con la transcripción
        console.log(`[Callback] Actualizando acta ${actaId} con la transcripción completa...`);
        const { error: updateError } = await supabase
            .from('actas')
            .update({
                transcript: formattedTranscription.trim(),
                status: 'transcribed'
            })
            .eq('id', actaId);
        
        if (updateError) throw new Error(`Error al actualizar el acta en Supabase: ${updateError.message}`);
        
        console.log("[Callback] Base de datos actualizada. Disparando siguiente paso en Cloud Run...");
        
        // 6. Disparar el siguiente paso en Cloud Run
        await fetch(process.env.CLOUD_RUN_DIARIZE_URL!, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${process.env.CLOUD_RUN_SECRET}`
            },
            body: JSON.stringify({ actaId: actaId })
        });
        
        console.log("[Callback] Siguiente paso disparado. Respondiendo a Deepgram.");
        return NextResponse.json({ success: true, message: "Resultados obtenidos y siguiente paso iniciado." });

    } catch (error: any) {
        console.error("[Callback] Error fatal:", error.message);
        // Intentar marcar el acta como errónea si tenemos el ID
        if (actaId) {
            const supabaseAdmin = createAdminClient();
            await supabaseAdmin.from('actas').update({ status: 'error', summary: `Fallo en transcribe-callback: ${error.message}` }).eq('id', actaId);
        }
        return NextResponse.json({ error: "Internal Server Error", details: error.message }, { status: 500 });
    }
}