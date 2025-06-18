// app/api/transcribe/route.ts
import { NextResponse, NextRequest } from "next/server"; // [MODIFICADO] Importamos NextRequest para usar req.json()
import { type PrerecordedSchema, createClient } from "@deepgram/sdk";
// [ELIMINADO] Ya no necesitamos Buffer porque no procesamos el archivo localmente.
// import { Buffer } from "node:buffer";

export async function POST(req: NextRequest) { // [MODIFICADO] Usamos NextRequest para mejor tipado
  try {
    // 1. [MODIFICADO] Leemos los datos entrantes como JSON en lugar de FormData.
    const { audioUrl, deepgram_api_key } = await req.json();

    // 2. [MODIFICADO] Validamos que la clave de API y la URL del audio se hayan recibido.
    if (!deepgram_api_key) {
      console.error("Deepgram API key not provided in the request body.");
      return NextResponse.json({ error: "Deepgram API key is required" }, { status: 400 });
    }
    if (!audioUrl) {
      console.error("No audio URL received in request body.");
      return NextResponse.json({ error: "No audio URL provided" }, { status: 400 });
    }

    // 3. Inicializar el cliente de Deepgram DINÁMICAMENTE con la clave recibida. (Tu código original)
    const deepgram = createClient(deepgram_api_key);

    console.log("Audio URL received:", audioUrl);

    // [ELIMINADO] La conversión de Blob a Buffer ya no es necesaria.
    // const audioArrayBuffer = await audioBlob.arrayBuffer();
    // const audioBuffer = Buffer.from(audioArrayBuffer);

    // 4. [MODIFICADO] Llamada a Deepgram usando la función para URLs.
    const deepgramResponse = await deepgram.listen.prerecorded.transcribeUrl(
      { url: audioUrl }, // <--- El cambio clave está aquí
      {
        // --- TU CONFIGURACIÓN DE DEEPGRAM SE MANTIENE EXACTAMENTE IGUAL ---
        model: "nova-3",
        smart_format: true,
        punctuate: true,
        diarize: true,
        language: "multi",
      } as PrerecordedSchema
    );

    console.log("Deepgram transcription successful");

    if (!deepgramResponse.result) {
      console.error("Deepgram response result is missing.");
      return NextResponse.json({ error: "Error processing transcription result" }, { status: 500 });
    }

    // 5. [SIN CAMBIOS] Tu lógica personalizada para formatear la transcripción se mantiene.
    // Esta parte es excelente y no necesita cambios.
    const words = deepgramResponse.result.results.channels?.[0]?.alternatives?.[0]?.words;
    if (words && Array.isArray(words)) {
      let formattedTranscription = "";
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
      return NextResponse.json({ text: formattedTranscription.trim() });
    } else {
      const fallbackTranscript = deepgramResponse.result.results.channels?.[0]?.alternatives?.[0]?.transcript;
      if (fallbackTranscript) {
        return NextResponse.json({ text: fallbackTranscript });
      }
      return NextResponse.json({ error: "No words found in transcription result" }, { status: 500 });
    }
  } catch (error: any) {
    console.error("Error processing audio or calling Deepgram SDK:", error);
    return NextResponse.json({ error: "Error transcribing audio", details: error.message }, { status: 500 });
  }
}