// app/api/transcribe/route.ts
import { NextResponse, NextRequest } from "next/server";
import { type PrerecordedSchema, createClient as createDeepgramClient } from "@deepgram/sdk";

export async function POST(req: NextRequest) {
  try {
    const { audioUrl, deepgram_api_key, actaId } = await req.json();

    if (!deepgram_api_key || !audioUrl || !actaId) {
      return NextResponse.json(
        { error: "Faltan parámetros: deepgram_api_key, audioUrl y actaId son requeridos." },
        { status: 400 }
      );
    }

    const appUrl = process.env.NEXT_PUBLIC_VERCEL_URL 
      ? `https://${process.env.NEXT_PUBLIC_VERCEL_URL}` 
      : 'http://localhost:3000';
    const callbackUrl = new URL('/api/transcribe-callback', appUrl);
    
    if (!process.env.CALLBACK_SECRET) {
        console.error("CRITICAL: La variable de entorno CALLBACK_SECRET no está configurada.");
        throw new Error("Server configuration error: Callback secret is missing.");
    }
    callbackUrl.searchParams.append('secret', process.env.CALLBACK_SECRET);

    const deepgram = createDeepgramClient(deepgram_api_key);

    console.log(`Iniciando transcripción para actaId: ${actaId} con callback a: ${callbackUrl.toString()}`);

    // [CORREGIDO] La llamada a Deepgram se unifica en un solo método.
    // La URL del callback se pasa DENTRO del objeto de opciones.
    // Ya no se usa 'transcribeUrlCallback', sino 'transcribeUrl'. La presencia de la propiedad 'callback'
    // le indica al SDK que debe hacer la llamada de forma asíncrona.
    await deepgram.listen.prerecorded.transcribeUrl(
      { url: audioUrl }, // Argumento 1: La fuente del audio
      {                 // Argumento 2: El objeto de opciones completo
        
        // La URL de callback va aquí, como una propiedad del objeto de opciones
        callback: callbackUrl.toString(), 
        
        // El resto de tus opciones de Deepgram se mantienen igual
        model: "nova-3",
        smart_format: true,
        punctuate: true,
        diarize: true,
        language: "multi",
        
        // El tag para identificar la petición también va aquí
        tag: actaId,
      } as PrerecordedSchema
    );

    // La respuesta inmediata no cambia. Sigue siendo 202 Accepted.
    return NextResponse.json(
      { message: "Proceso de transcripción iniciado correctamente." },
      { status: 202 }
    );

  } catch (error: any) {
    console.error("Error al iniciar la transcripción con Deepgram:", error);
    return NextResponse.json({ error: "Error iniciando la transcripción", details: error.message }, { status: 500 });
  }
}