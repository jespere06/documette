// app/api/transcribe/route.ts
import { NextResponse } from "next/server";
import { type PrerecordedSchema, createClient } from "@deepgram/sdk";

export async function POST(req: Request) {
  try {
    // 1. [MODIFICADO] Leer los datos entrantes como JSON en lugar de FormData.
    const { audioUrl, deepgram_api_key } = await req.json();

    // 2. [MODIFICADO] Validar que la clave de API y la URL del audio se hayan recibido.
    if (!deepgram_api_key) {
      console.error("Deepgram API key not provided in the request body.");
      return NextResponse.json({ error: "Deepgram API key is required" }, { status: 400 });
    }

    if (!audioUrl) {
      console.error("No audio URL received in request body.");
      return NextResponse.json({ error: "No audio URL provided" }, { status: 400 });
    }

    // 3. Inicializar el cliente de Deepgram DINÁMICAMENTE con la clave recibida.
    const deepgram = createClient(deepgram_api_key);

    console.log("Audio URL received:", audioUrl);

    // 4. [MODIFICADO] Llamada a Deepgram usando la URL.
    // Ya no es necesario convertir Blob a Buffer.
    const deepgramResponse = await deepgram.listen.prerecorded.transcribeUrl(
      { url: audioUrl }, // <--- El cambio clave está aquí
      {
        model: "nova-2",
        smart_format: true,
        punctuate: true,
        diarize: true,
        language: "es",
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
          console.warn("Speaker information is missing for a word:", wordInfo.word);
          currentUtteranceBlock += wordInfo.word + " "; // Continuar añadiendo la palabra
          continue;
        }

        if (currentSpeaker === null) {
          currentSpeaker = speaker;
        }
        
        if (speaker !== currentSpeaker) {
          // El hablante cambió, finaliza el bloque anterior.
          if (currentUtteranceBlock.trim() !== "") {
              formattedTranscription += `[Speaker:${currentSpeaker}] ${currentUtteranceBlock.trim()}\n`;
          }
          currentSpeaker = speaker;
          currentUtteranceBlock = ""; // Reiniciar el bloque.
        }
        
        currentUtteranceBlock += wordInfo.word + " ";
      }

      // Añadir el último bloque de diálogo.
      if (currentUtteranceBlock.trim() !== "" && currentSpeaker !== null) {
        formattedTranscription += `[Speaker:${currentSpeaker}] ${currentUtteranceBlock.trim()}`;
      }

      // Devolver la transcripción con el formato [Speaker:X]
      return NextResponse.json({ text: formattedTranscription.trim() });
    } else {
      // Si no hay 'words', devolver la transcripción completa como respaldo.
      const fallbackTranscript = deepgramResponse.result.results.channels?.[0]?.alternatives?.[0]?.transcript;
      if (fallbackTranscript) {
        return NextResponse.json({ text: fallbackTranscript });
      }
      return NextResponse.json({ error: "No words found in transcription result" }, { status: 500 });
    }
  } catch (error: any) {
    console.error("Error processing audio URL or calling Deepgram SDK:", error);
    return NextResponse.json({ error: "Error transcribing audio", details: error.message }, { status: 500 });
  }
}