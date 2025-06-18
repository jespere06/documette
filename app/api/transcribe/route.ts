// app/api/transcribe/route.ts
import { NextResponse } from "next/server"
import { type PrerecordedSchema, createClient } from "@deepgram/sdk"
import { Buffer } from "node:buffer"

// La exportación 'config' es para el antiguo Pages Router y no es necesaria
// en el App Router, por lo que se puede eliminar de forma segura.

export async function POST(req: Request) {
  try {
    // 1. Leer los datos entrantes como FormData.
    const formData = await req.formData()

    // 2. Extraer tanto el archivo de audio como la clave de API.
    const audioBlob = formData.get("audio") as Blob | null
    const deepgramApiKey = "0ee94949c2278da686547691a0057d32bf5267fa" //formData.get("deepgram_api_key") as string | null

    // 3. Validar que la clave de API se haya recibido correctamente.
    if (!deepgramApiKey) {
      console.error("Deepgram API key not provided in the request body.")
      return NextResponse.json({ error: "Deepgram API key is required" }, { status: 400 })
    }

    // Validar el archivo de audio.
    if (!audioBlob) {
      console.error("No audio file received in request body.")
      return NextResponse.json({ error: "No audio file provided" }, { status: 400 })
    }

    // 4. Inicializar el cliente de Deepgram DINÁMICAMENTE con la clave recibida.
    const deepgram = createClient(deepgramApiKey)

    console.log("Audio Blob received. Size:", audioBlob.size, "Type:", audioBlob.type)

    // Convertir Blob a Buffer de Node.js
    const audioArrayBuffer = await audioBlob.arrayBuffer()
    const audioBuffer = Buffer.from(audioArrayBuffer)

    // Llamada a Deepgram (tu lógica se mantiene igual aquí).
    const deepgramResponse = await deepgram.listen.prerecorded.transcribeFile(audioBuffer, {
      model: "nova-2", // Recomendación: nova-2 es a menudo más rápido y rentable.
      smart_format: true,
      punctuate: true,
      diarize: true,
      language: "es", // Especificar el idioma puede mejorar la precisión.
    } as PrerecordedSchema)

    console.log("Deepgram transcription successful")

    if (!deepgramResponse.result) {
      console.error("Deepgram response result is missing.")
      return NextResponse.json({ error: "Error processing transcription result" }, { status: 500 })
    }

    // Mantener tu lógica personalizada para formatear la transcripción.
    // Esta parte es excelente y no necesita cambios.
    const words = deepgramResponse.result.results.channels?.[0]?.alternatives?.[0]?.words

    if (words && Array.isArray(words)) {
      let formattedTranscription = ""
      let currentSpeaker: number | null = null
      let currentUtteranceBlock = ""

      for (const wordInfo of words) {
        const speaker = wordInfo.speaker

        if (speaker === undefined) {
          console.warn("Speaker information is missing for a word:", wordInfo.word)
          currentUtteranceBlock += wordInfo.word + " " // Continuar añadiendo la palabra aunque no tenga speaker
          continue
        }

        if (currentSpeaker === null) {
          currentSpeaker = speaker
        }
        
        if (speaker !== currentSpeaker) {
          // El hablante cambió, finaliza el bloque anterior.
          if (currentUtteranceBlock.trim() !== "") {
              formattedTranscription += `[Speaker:${currentSpeaker}] ${currentUtteranceBlock.trim()}\n`
          }
          currentSpeaker = speaker
          currentUtteranceBlock = "" // Reiniciar el bloque.
        }
        
        currentUtteranceBlock += wordInfo.word + " "
      }

      // Añadir el último bloque de diálogo.
      if (currentUtteranceBlock.trim() !== "" && currentSpeaker !== null) {
        formattedTranscription += `[Speaker:${currentSpeaker}] ${currentUtteranceBlock.trim()}`
      }

      // Devolver la transcripción con el formato [Speaker:X]
      // Renombramos la clave a 'text' para que coincida con lo que el siguiente paso espera.
      return NextResponse.json({ text: formattedTranscription.trim() })
    } else {
      // Si no hay 'words', devolver la transcripción completa como respaldo.
      const fallbackTranscript = deepgramResponse.result.results.channels?.[0]?.alternatives?.[0]?.transcript;
      if (fallbackTranscript) {
        return NextResponse.json({ text: fallbackTranscript });
      }
      return NextResponse.json({ error: "No words found in transcription result" }, { status: 500 })
    }
  } catch (error: any) {
    console.error("Error processing audio or calling Deepgram SDK:", error)
    return NextResponse.json({ error: "Error transcribing audio", details: error.message }, { status: 500 })
  }
}