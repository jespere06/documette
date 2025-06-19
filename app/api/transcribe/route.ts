// app/api/transcribe/route.ts
import { NextResponse, NextRequest } from "next/server";

export async function POST(req: NextRequest) {
  try {
    const { audioUrl, deepgram_api_key, actaId } = await req.json();

    if (!deepgram_api_key || !audioUrl || !actaId) {
      return NextResponse.json(
        { error: "Faltan parámetros: deepgram_api_key, audioUrl y actaId son requeridos." },
        { status: 400 }
      );
    }

    // 1. Construir la URL del callback (sin cambios)
    const appUrl = process.env.NEXT_PUBLIC_APP_URL || (process.env.VERCEL_URL ? `https://${process.env.VERCEL_URL}` : 'http://localhost:3000');
    const callbackUrlWithSecret = new URL('/api/transcribe-callback', appUrl);
    
    if (!process.env.CALLBACK_SECRET) {
        console.error("CRITICAL: La variable de entorno CALLBACK_SECRET no está configurada.");
        throw new Error("Server configuration error: Callback secret is missing.");
    }
    callbackUrlWithSecret.searchParams.append('secret', process.env.CALLBACK_SECRET);

    // 2. Construir la URL de la API de Deepgram con todos los parámetros
    const deepgramUrl = new URL('https://api.deepgram.com/v1/listen');
    deepgramUrl.searchParams.append('model', 'nova-3');
    deepgramUrl.searchParams.append('smart_format', 'true');
    deepgramUrl.searchParams.append('punctuate', 'true');
    deepgramUrl.searchParams.append('diarize', 'true');
    deepgramUrl.searchParams.append('language', 'multi');
    deepgramUrl.searchParams.append('tag', actaId); // Pasamos el actaId como tag
    deepgramUrl.searchParams.append('callback', callbackUrlWithSecret.toString()); // ¡El callback!

    console.log(`[Transcribe API - fetch] Iniciando transcripción para actaId: ${actaId}`);
    console.log(`[Transcribe API - fetch] URL de Deepgram: ${deepgramUrl.toString()}`);

    // 3. Realizar la llamada a la API con fetch
    const deepgramResponse = await fetch(deepgramUrl.toString(), {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Token ${deepgram_api_key}`
      },
      body: JSON.stringify({
        url: audioUrl,
      }),
    });

    // 4. Verificar la respuesta de Deepgram
    // En una llamada asíncrona, Deepgram debería devolver un 200 o 201 si aceptó la petición.
    if (!deepgramResponse.ok) {
      const errorBody = await deepgramResponse.json();
      console.error("Error en la respuesta de Deepgram:", errorBody);
      throw new Error(`Deepgram API devolvió un error: ${errorBody.err_msg || deepgramResponse.statusText}`);
    }
    
    const responseData = await deepgramResponse.json();
    console.log("[Transcribe API - fetch] Petición enviada a Deepgram. Response:", responseData);

    // Respondemos inmediatamente al cliente
    return NextResponse.json(
      { message: "Proceso de transcripción iniciado correctamente.", deepgram_request_id: responseData.request_id },
      { status: 202 }
    );

  } catch (error: any) {
    console.error("Error en /api/transcribe (usando fetch):", error.message);
    return NextResponse.json({ error: "Error iniciando la transcripción", details: error.message }, { status: 500 });
  }
}