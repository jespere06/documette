// /app/api/generate-acta/route.ts

import { GoogleGenAI, Type, Content } from "@google/genai";
import { NextResponse } from "next/server";

export const dynamic = "force-dynamic";

export async function POST(req: Request) {
  try {
    const { transcript, speakers, gemini_api_key, prompt: userPrompt } = await req.json();

    if (!gemini_api_key) {
      return NextResponse.json({ error: "Gemini API key is required" }, { status: 400 });
    }
    if (!transcript || !speakers) {
      return NextResponse.json({ error: "Transcript and speakers are required." }, { status: 400 });
    }

    const ai = new GoogleGenAI({ apiKey: gemini_api_key });

    // Configuración para respuesta JSON
    const config = {
      // thinkingConfig solo funciona en generateContentStream,
      thinkingConfig: {
        thinkingBudget: -1, 
      },
      temperature: 0.7,
      topP: 0.9,
      topK: 30,
      maxOutputTokens: 50192,
            responseMimeType: "application/json",
      responseSchema: {
        type: Type.OBJECT,
        properties: {
          markdown: {
            type: Type.STRING,
            description: "El contenido completo del acta de reunión en formato Markdown.",
          },
          agreements: {
            type: Type.ARRAY,
            description: "Una lista de los acuerdos o puntos de acción clave extraídos de la reunión.",
            items: {
              type: Type.STRING,
            },
          },
        },
        required: ["markdown", "agreements"],
      },
    };

    const speakersListString = speakers
      .map((s: { name: string; role: string }) => `- ${s.name} (${s.role})`)
      .join("\n");

    const instructionPrompt =
      userPrompt ||
      `
      Eres un asistente experto en la redacción de actas de reunión.
      Tu tarea es analizar la transcripción y la lista de participantes para generar un acta completa y bien estructurada en formato Markdown y una lista de acuerdos.
      Sigue la estructura del JSON solicitado.
    `;

    const contents: Content[] = [
      {
        role: "user",
        parts: [
          {
            text: `
              **Instrucción:**
              ${instructionPrompt}

              ---
              **Datos para esta reunión:**

              **Lista de Participantes:**
              ${speakersListString}

              **Transcripción de la Reunión:**
              \`\`\`
              ${transcript}
              \`\`\`
            `,
          },
        ],
      },
    ];

    const model = "gemini-2.5-flash";

    // Llamada NO streaming
    const response = await ai.models.generateContent({
      model,
      config,
      contents,
    });

    // Extraemos el JSON de la respuesta
    // Dependiendo de la versión del SDK puede venir en response.text o en response.choices[0].message.text
    const jsonString =
      // propiedad genérica
      (response as any).text ??
      // forma alternativa si hay choices/messages
      ((response as any).choices?.[0]?.message?.parts?.[0]?.text ?? null);

    if (!jsonString) {
      return NextResponse.json(
        { error: "No se recibió texto de la IA." },
        { status: 500 }
      );
    }

    // Parseo y respuesta final
    try {
      const parsed = JSON.parse(jsonString);
      return NextResponse.json(parsed, { status: 200 });
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
  } catch (error: any) {
    console.error("Error en /api/generate-acta:", error);
    return NextResponse.json(
      { error: `Error generando acta: ${error.message}` },
      { status: 500 }
    );
  }
}
