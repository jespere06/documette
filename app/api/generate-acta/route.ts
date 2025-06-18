// /app/api/generate-acta/route.ts

import { GoogleGenAI, Type, Content } from "@google/genai";
import { NextResponse } from "next/server";

export const dynamic = "force-dynamic";

// [NUEVO] Función helper para reintentar con exponential backoff
// Se coloca fuera de la función POST para que no se redeclare en cada llamada.
async function retryWithBackoff<T>(fn: () => Promise<T>, retries = 3, delay = 1000): Promise<T> {
  try {
    // Intenta ejecutar la función que se le pasa (la llamada a la API)
    return await fn();
  } catch (error: any) {
    // Si falla, verifica si quedan reintentos
    if (retries > 0) {
      const errorMessage = error.toString().toLowerCase();
      // Solo reintenta en errores de sobrecarga o indisponibilidad (503)
      if (errorMessage.includes("503") || errorMessage.includes("overloaded") || errorMessage.includes("unavailable")) {
        console.log(`Intento fallido por sobrecarga. Reintentando en ${delay}ms... (${retries} reintentos restantes)`);
        // Espera un tiempo antes de reintentar
        await new Promise(res => setTimeout(res, delay));
        // Llama a sí misma de nuevo, con un reintento menos y el doble de tiempo de espera
        return retryWithBackoff(fn, retries - 1, delay * 2);
      }
    }
    // Si no es un error reintentable o se acabaron los reintentos, lanza el error para que sea capturado por el bloque catch principal.
    throw error;
  }
}


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

    // --- NINGÚN CAMBIO EN LA CONFIGURACIÓN ---
    const config = {
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

    // --- NINGÚN CAMBIO EN LA CONSTRUCCIÓN DEL PROMPT ---
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

    // [MODIFICADO] La llamada a la API ahora está envuelta en la función de reintento.
    const response = await retryWithBackoff(async () => {
      // La lógica original de la llamada se mantiene intacta aquí dentro.
      return ai.models.generateContent({
        model,
        config,
        contents,
      });
    });

    // --- NINGÚN CAMBIO EN EL PROCESAMIENTO DE LA RESPUESTA ---
    const jsonString =
      (response as any).text ??
      ((response as any).choices?.[0]?.message?.parts?.[0]?.text ?? null);

    if (!jsonString) {
      return NextResponse.json(
        { error: "No se recibió texto de la IA." },
        { status: 500 }
      );
    }

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