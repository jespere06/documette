// ruta: app/api/transcribe-callback/route.ts

import { NextResponse, NextRequest } from 'next/server';
import { createClient } from '@/lib/supabase/server';

export const dynamic = "force-dynamic";

export async function POST(req: NextRequest) {
    // ==========================================================
    // INICIO DEL PROCESAMIENTO DEL CALLBACK
    // ==========================================================
    console.log("==========================================================");
    console.log("[CALLBACK_INICIO] Recibida nueva petición en /api/transcribe-callback");
    console.log(`[CALLBACK_INICIO] Timestamp: ${new Date().toISOString()}`);
    // ==========================================================

    // 1. Verificación de Seguridad
    const secret = req.nextUrl.searchParams.get('secret');
    if (secret !== process.env.CALLBACK_SECRET) {
        console.error("[CALLBACK_ERROR] Secreto de callback inválido o ausente.");
        return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }
    console.log("[CALLBACK_PASO_1] Verificación de secreto exitosa.");

    try {
        const deepgramPayload = await req.json();
        
        // 2. Extraer el actaId
        const actaId = deepgramPayload.metadata?.tags?.[0];
        if (!actaId) {
            console.error("[CALLBACK_ERROR] No se encontró 'actaId' en los metadatos del payload de Deepgram.", deepgramPayload.metadata);
            return NextResponse.json({ error: "actaId no encontrado en el payload" }, { status: 400 });
        }
        console.log(`[CALLBACK_PASO_2] Extracción de actaId exitosa. ID: ${actaId}`);
        
        // 3. Formatear la transcripción
        let formattedTranscription = "";
        const words = deepgramPayload.results?.channels?.[0]?.alternatives?.[0]?.words;

        if (words && Array.isArray(words)) {
            // ... (tu lógica de formateo, que ya sabemos que funciona bien) ...
            let currentSpeaker = null, currentUtteranceBlock = "";
            for (const wordInfo of words) { const speaker = wordInfo.speaker; if (speaker === undefined) { currentUtteranceBlock += wordInfo.word + " "; continue; } if (currentSpeaker === null) { currentSpeaker = speaker; } if (speaker !== currentSpeaker) { if (currentUtteranceBlock.trim() !== "") { formattedTranscription += `[Speaker:${currentSpeaker}] ${currentUtteranceBlock.trim()}\n`; } currentSpeaker = speaker; currentUtteranceBlock = ""; } currentUtteranceBlock += wordInfo.word + " "; } if (currentUtteranceBlock.trim() !== "" && currentSpeaker !== null) { formattedTranscription += `[Speaker:${currentSpeaker}] ${currentUtteranceBlock.trim()}`; }
        } else {
            formattedTranscription = deepgramPayload.results?.channels?.[0]?.alternatives?.[0]?.transcript || "Transcripción no disponible.";
        }
        
        const transcriptLength = formattedTranscription.length;
        console.log(`[CALLBACK_PASO_3] Formateo de transcripción completado. Longitud: ${transcriptLength} caracteres.`);
        if (transcriptLength === 0) {
            console.warn("[CALLBACK_ADVERTENCIA] La transcripción generada está vacía.");
        }
        
        // ==========================================================
        // 4. Actualizar la base de datos de Supabase (PUNTO CRÍTICO 1)
        // ==========================================================
        const supabase = await createClient();
        console.log(`[CALLBACK_PASO_4_INICIO] Intentando actualizar acta ${actaId} en Supabase...`);
        
        const { data: updateData, error: updateError } = await supabase
            .from('actas')
            .update({
                transcript: formattedTranscription.trim(),
                status: 'transcribed'
            })
            .eq('id', actaId)
            .select(); // <<--- AÑADIMOS .select() PARA VER QUÉ DEVUELVE LA ACTUALIZACIÓN

        if (updateError) {
            // Este es el log más importante si la DB falla
            console.error(`[CALLBACK_ERROR_DB] Error al actualizar Supabase para el acta ${actaId}.`, updateError);
            throw new Error(`Error al actualizar el acta ${actaId} en Supabase: ${updateError.message}`);
        }
        
        console.log(`[CALLBACK_PASO_4_EXITO] Supabase actualizado exitosamente para el acta ${actaId}.`);
        console.log("[CALLBACK_PASO_4_EXITO] Filas afectadas:", updateData?.length ?? 0);
        if (updateData?.length === 0) {
            console.error(`[CALLBACK_ERROR_DB] ¡ADVERTENCIA! La actualización no afectó a ninguna fila. ¿Existe el actaId ${actaId}?`);
        }

        // ==========================================================
        // 5. Disparar Cloud Run (PUNTO CRÍTICO 2)
        // ==========================================================
        if (!process.env.CLOUD_RUN_DIARIZE_URL || !process.env.CLOUD_RUN_SECRET) {
            throw new Error("Las variables de entorno de Cloud Run para diarización no están configuradas.");
        }
        
        console.log(`[CALLBACK_PASO_5_INICIO] Preparando para llamar a Cloud Run. URL: ${process.env.CLOUD_RUN_DIARIZE_URL}`);
        
        // Usamos un try/catch específico para la llamada fetch para aislar su error
        try {
            const cloudRunResponse = await fetch(process.env.CLOUD_RUN_DIARIZE_URL, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${process.env.CLOUD_RUN_SECRET}` 
                },
                body: JSON.stringify({ actaId: actaId })
            });

            console.log(`[CALLBACK_PASO_5_RESPUESTA] Respuesta de Cloud Run recibida. Status: ${cloudRunResponse.status}`);

            if (!cloudRunResponse.ok) {
                const errorBody = await cloudRunResponse.text();
                console.error(`[CALLBACK_ERROR_CR] La llamada a Cloud Run falló. Status: ${cloudRunResponse.status}. Body:`, errorBody);
                // Decidimos si lanzar un error aquí o no. Por ahora, solo lo logueamos para no detener el flujo.
            } else {
                console.log(`[CALLBACK_PASO_5_EXITO] Llamada a Cloud Run para el acta ${actaId} enviada exitosamente.`);
            }

        } catch (fetchError: any) {
            console.error("[CALLBACK_ERROR_FETCH] Fallo catastrófico al intentar hacer fetch a Cloud Run.", fetchError);
            // Podríamos lanzar este error para que el catch principal lo maneje
            throw fetchError;
        }

        // 6. Responder a Deepgram
        console.log("[CALLBACK_FIN] Proceso completado. Enviando respuesta 200 a Deepgram.");
        return NextResponse.json({ success: true, message: "Callback procesado y siguiente paso iniciado." });

    } catch (error: any) {
        console.error("!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!");
        console.error("!!! [CALLBACK_ERROR_FATAL] Error en el bloque try-catch principal !!!");
        console.error(`!!! Timestamp: ${new Date().toISOString()}`);
        console.error("!!! Error:", error.message);
        console.error("!!! Stack:", error.stack);
        console.error("!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!");
        
        // La lógica para marcar el acta como errónea no cambia...
        try {
            const payloadForError = await req.clone().json();
            const actaIdForError = payloadForError.metadata?.tags?.[0];
            if (actaIdForError) {
                const supabase = await createClient();
                await supabase.from('actas').update({ status: 'error', summary: `Fallo en callback: ${error.message}` }).eq('id', actaIdForError);
            }
        } catch (e) {
            console.error("[CALLBACK_ERROR_FATAL] No se pudo ni siquiera marcar el acta como errónea en la DB.", e);
        }
        
        return NextResponse.json({ error: "Internal Server Error", details: error.message }, { status: 500 });
    }
}