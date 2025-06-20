// ruta: app/api/transcribe/route.ts

import { NextResponse, NextRequest } from "next/server";
import { createAdminClient } from '@/lib/supabase/admin';

export async function POST(req: NextRequest) {
  try {
    const { audioUrl, deepgram_api_key, actaId } = await req.json();

    if (!deepgram_api_key || !audioUrl || !actaId) {
      return NextResponse.json(
        { error: "Faltan parámetros: deepgram_api_key, audioUrl y actaId son requeridos." },
        { status: 400 }
      );
    }

    // ==========================================================
    // [CAMBIO CLAVE] Construimos la URL del callback apuntando a Cloud Run
    // ==========================================================
    if (!process.env.CLOUD_RUN_CALLBACK_URL || !process.env.CALLBACK_SECRET) {
        throw new Error("La URL de callback de Cloud Run o el secreto no están configurados en Vercel.");
    }
    
    // 1. Tomamos la URL base del nuevo servicio en Cloud Run
    const callbackUrl = new URL(process.env.CLOUD_RUN_CALLBACK_URL);
    // 2. Le añadimos el secreto para la verificación
    callbackUrl.searchParams.append('secret', process.env.CALLBACK_SECRET);

    // 3. Construimos la URL de la API de Deepgram
    const deepgramUrl = new URL('https://api.deepgram.com/v1/listen');
    deepgramUrl.searchParams.append('model', 'nova-3');
    deepgramUrl.searchParams.append('smart_format', 'true');
    deepgramUrl.searchParams.append('punctuate', 'true');
    deepgramUrl.searchParams.append('diarize', 'true');
    deepgramUrl.searchParams.append('language', 'multi');
    deepgramUrl.searchParams.append('tag', actaId);
    // 4. Le pasamos a Deepgram la URL completa del callback en Cloud Run
    deepgramUrl.searchParams.append('callback', callbackUrl.toString());

    console.log(`[Transcribe API] Iniciando transcripción. Callback apuntará a Cloud Run para el acta: ${actaId}`);

    // 5. Realizar la llamada a la API de Deepgram
    const deepgramResponse = await fetch(deepgramUrl.toString(), {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Token ${deepgram_api_key}`
      },
      body: JSON.stringify({ url: audioUrl }),
    });

    if (!deepgramResponse.ok) {
      const errorBody = await deepgramResponse.json();
      throw new Error(`Deepgram API devolvió un error: ${errorBody.err_msg || deepgramResponse.statusText}`);
    }
    
    const responseData = await deepgramResponse.json();
    const requestId = responseData.request_id;

    if (!requestId) {
        throw new Error("Deepgram no devolvió un request_id en la respuesta.");
    }
    
    console.log(`[Transcribe API] Petición enviada. Request ID: ${requestId}`);

    // 6. Guardar el request_id en Supabase
    const supabase = createAdminClient();
    const { error: updateError } = await supabase
      .from('actas')
      .update({ deepgram_request_id: requestId })
      .eq('id', actaId);

    if (updateError) {
      console.error(`[Transcribe API] ADVERTENCIA: Error al guardar el request_id para el acta ${actaId}:`, updateError.message);
    } else {
      console.log(`[Transcribe API] Request ID guardado exitosamente para el acta ${actaId}.`);
    }

    // 7. Responder al cliente
    return NextResponse.json(
      { message: "Proceso de transcripción iniciado correctamente." },
      { status: 202 }
    );

  } catch (error: any) {
    console.error("Error fatal en /api/transcribe:", error.message);
    return NextResponse.json({ error: "Error iniciando la transcripción", details: error.message }, { status: 500 });
  }
}