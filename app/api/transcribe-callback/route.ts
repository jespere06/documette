// ruta: app/api/transcribe-callback/route.ts

import { NextResponse, NextRequest } from 'next/server';
import { createClient } from '@/lib/supabase/server'; // ¡Importante! Usar el cliente de servidor aquí.

export const dynamic = "force-dynamic"; // Asegura que se ejecute como una función dinámica en Vercel

export async function POST(req: NextRequest) {
    // 1. Verificación de Seguridad: Asegurarse de que la llamada viene de nuestro flujo.
    const secret = req.nextUrl.searchParams.get('secret');
    if (secret !== process.env.CALLBACK_SECRET) {
        console.warn("Llamada a callback de transcripción con secreto inválido.");
        return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    try {
        const deepgramPayload = await req.json();
        
        // 2. Extraer el actaId que pasamos como 'tag' en la petición original.
        const actaId = deepgramPayload.metadata?.tags?.[0];
        if (!actaId) {
            console.error("Error: No se encontró 'actaId' en los metadatos del callback de Deepgram.", deepgramPayload.metadata);
            return NextResponse.json({ error: "actaId no encontrado en el payload" }, { status: 400 });
        }

        console.log(`[Callback] Transcripción recibida para el acta: ${actaId}`);
        
        // 3. Formatear la transcripción (movemos la lógica que antes estaba en /api/transcribe).
        // Esta lógica convierte la salida de Deepgram en el formato [Speaker:X] que necesitamos.
        let formattedTranscription = "";
        const words = deepgramPayload.results?.channels?.[0]?.alternatives?.[0]?.words;

        if (words && Array.isArray(words)) {
            let currentSpeaker: number | null = null;
            let currentUtteranceBlock = "";
            for (const wordInfo of words) {
                const speaker = wordInfo.speaker;
                if (speaker === undefined) {
                    currentUtteranceBlock += wordInfo.word + " ";
                    continue;
                }
                if (currentSpeaker === null) {
                    currentSpeaker = speaker;
                }
                if (speaker !== currentSpeaker) {
                    if (currentUtteranceBlock.trim() !== "") {
                        formattedTranscription += `[Speaker:${currentSpeaker}] ${currentUtteranceBlock.trim()}\n`;
                    }
                    currentSpeaker = speaker;
                    currentUtteranceBlock = "";
                }
                currentUtteranceBlock += wordInfo.word + " ";
            }
            if (currentUtteranceBlock.trim() !== "" && currentSpeaker !== null) {
                formattedTranscription += `[Speaker:${currentSpeaker}] ${currentUtteranceBlock.trim()}`;
            }
        } else {
            // Fallback por si no vienen las palabras detalladas
            formattedTranscription = deepgramPayload.results?.channels?.[0]?.alternatives?.[0]?.transcript || "Transcripción no disponible.";
        }
        
        // 4. Actualizar la base de datos de Supabase.
        const supabase = await createClient();
        console.log(`[Callback] Actualizando acta ${actaId} en Supabase con status 'transcribed'.`);
        const { error: updateError } = await supabase
            .from('actas')
            .update({
                transcript: formattedTranscription.trim(),
                status: 'transcribed' // ¡Cambiamos el estado! Esto notificará al cliente vía Realtime.
            })
            .eq('id', actaId);

        if (updateError) {
            // Si falla la actualización, lanzamos un error para que sea capturado por el catch.
            throw new Error(`Error al actualizar el acta ${actaId} en Supabase: ${updateError.message}`);
        }
        
        // 5. Disparar el siguiente paso: la identificación de hablantes en Cloud Run.
        // ¡DEBES AÑADIR CLOUD_RUN_DIARIZE_URL y CLOUD_RUN_SECRET a tus variables de entorno!
        if (!process.env.CLOUD_RUN_DIARIZE_URL || !process.env.CLOUD_RUN_SECRET) {
            throw new Error("Las variables de entorno de Cloud Run no están configuradas.");
        }
        
        console.log(`[Callback] Disparando proceso de diarización en Cloud Run para el acta: ${actaId}`);
        // No necesitamos esperar la respuesta de Cloud Run, es otro "fire-and-forget".
        fetch(process.env.CLOUD_RUN_DIARIZE_URL, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                // Usamos un secreto para autenticar la llamada entre nuestros servicios.
                'Authorization': `Bearer ${process.env.CLOUD_RUN_SECRET}` 
            },
            // Solo necesitamos enviar el ID. Cloud Run se encargará de obtener los datos de Supabase.
            body: JSON.stringify({ actaId: actaId })
        }).catch(err => {
            // Capturamos el error aquí para que no rompa el flujo de respuesta a Deepgram,
            // pero lo logueamos para depuración. En un escenario real, podríamos reintentar.
            console.error(`[Callback] Fallo al invocar Cloud Run para el acta ${actaId}:`, err);
        });

        // 6. Responder a Deepgram con un 200 OK para que sepa que recibimos el callback correctamente.
        return NextResponse.json({ success: true, message: "Callback procesado y siguiente paso iniciado." });

    } catch (error: any) {
        console.error("[Callback] Error fatal procesando el callback de transcripción:", error.message);

        // Intentamos marcar el acta como errónea en la DB para que el usuario sea notificado.
        try {
            const payloadForError = await req.clone().json(); // Clonamos para no consumir el body
            const actaIdForError = payloadForError.metadata?.tags?.[0];
            if (actaIdForError) {
                const supabase = await createClient();
                await supabase
                    .from('actas')
                    .update({ status: 'error', summary: 'Fallo durante el callback de transcripción.' })
                    .eq('id', actaIdForError);
            }
        } catch (e) {
            console.error("[Callback] No se pudo ni siquiera marcar el acta como errónea:", e);
        }
        
        // Devolvemos un error 500 para que Deepgram sepa que el procesamiento falló de nuestro lado.
        return NextResponse.json({ error: "Internal Server Error", details: error.message }, { status: 500 });
    }
}