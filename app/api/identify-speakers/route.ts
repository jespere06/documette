// /app/api/identify-speakers/route.ts

import { GoogleGenAI, Type, Content } from "@google/genai";
import { NextResponse } from "next/server";

export const dynamic = "force-dynamic";

export async function POST(req: Request) {
  console.log("identify-speaker API route POST function started");

  try {
    const { transcript, context, gemini_api_key } = await req.json();

    if (!gemini_api_key) {
      console.error("Gemini API key not provided in the request body.");
      return NextResponse.json({ error: "Gemini API key is required" }, { status: 400 });
    }

    if (!transcript) {
      console.log("identify-speaker API route - Missing transcript");
      return NextResponse.json({ error: "Missing 'transcript' in the request body." }, { status: 400 });
    }

    // Instanciamos el SDK
    const ai = new GoogleGenAI({ apiKey: gemini_api_key });

    // Configuración de generación y esquema JSON
    const config = {
      temperature: 0.7,
      topP: 0.9,
      topK: 30,
      maxOutputTokens: 20192,
      responseMimeType: "application/json",
      responseSchema: {
        type: Type.OBJECT,
        properties: {
          summary: {
            type: Type.STRING,
            description: "Un resumen general y breve de los temas tratados en la reunión."
          },
          speaker: {
            type: Type.ARRAY,
            items: {
              type: Type.OBJECT,
              properties: {
                speaker_number_to_replace: { type: Type.INTEGER },
                name: { type: Type.STRING },
                role: { type: Type.STRING },
              },
              required: ["speaker_number_to_replace", "name", "role"],
            },
          },
        },
        required: ["summary", "speaker"],
      },
    };

    const contextInstruction = context
      ? `\nInformación de contexto adicional para mejorar la precisión:\n${context}\n`
      : "";

    const prompt = `
Analiza la siguiente transcripción de una reunión y extrae la siguiente información:

1.  **summary**: Un resumen general y breve sobre los temas principales tratados en la reunión.
2.  **speaker**: Una lista con cada hablante identificado, extrayendo para cada uno:
    *   **speaker_number_to_replace**: El número entero que aparece en la etiqueta [Speaker:<número>].
    *   **name**: El nombre del hablante, inferido del texto. Si no se puede determinar, usa "Desconocido".
    *   **role**: El rol o función del hablante. Si no se puede inferir, usa "Desconocido".
${contextInstruction}
Transcripción:
\`\`\`
${transcript}
\`\`\`

Devuelve únicamente un objeto JSON que cumpla con la estructura especificada y sin ningún texto adicional.
`;

    const contents: Content[] = [
      {
        role: "user",
        parts: [{ text: prompt }]
      }
    ];

    // Llamada NO streaming
    const response = await ai.models.generateContent({
      model: "gemini-2.5-flash",
      config,
      contents,
    });

    // Extraemos el JSON de la respuesta
    const jsonString =
      // SDK v1: texto plano
      (response as any).text
      // SDK v2 con choices
      ?? (response as any).choices?.[0]?.message?.parts?.[0]?.text
      ?? null;

    if (!jsonString) {
      return NextResponse.json(
        { error: "No se recibió texto de la IA." },
        { status: 500 }
      );
    }

    // Parseo del JSON
    let parsedData: any;
    try {
      parsedData = JSON.parse(jsonString);
    } catch (err) {
      console.error("Error parsing JSON:", jsonString);
      return NextResponse.json(
        {
          error: "La IA no devolvió un JSON válido.",
          raw: jsonString,
        },
        { status: 500 }
      );
    }

    // Validación mínima
    if (!parsedData.summary || !Array.isArray(parsedData.speaker)) {
      return NextResponse.json(
        {
          error: "Formato de JSON inesperado.",
          raw: parsedData,
        },
        { status: 500 }
      );
    }

    // Sustitución de etiquetas en la transcripción
    let diarizedTranscript = transcript;
    for (const sp of parsedData.speaker) {
      const num = sp.speaker_number_to_replace;
      const name = sp.name || "Desconocido";
      const role = sp.role || "Rol Desconocido";
      const replacement = `\n\n**${name}, ${role}:**`;
      diarizedTranscript = diarizedTranscript.replaceAll(
        `[Speaker:${num}]`,
        replacement
      );
    }

    // Preparamos la lista de participantes
    const speakersList = parsedData.speaker.map((sp: any) => ({
      name: sp.name || "Desconocido",
      role: sp.role || "Desconocido",
    }));

    console.log("identify-speaker API route - Successful Response");
    return NextResponse.json(
      {
        diarizedTranscript,
        summary: parsedData.summary,
        speakers: speakersList,
      },
      { status: 200 }
    );

  } catch (error: any) {
    console.error("Error in /api/identify-speakers:", error);
    return NextResponse.json(
      { error: "Failed to process request", details: error.message },
      { status: 500 }
    );
  }
}
