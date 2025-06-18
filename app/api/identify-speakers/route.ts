// /app/api/identify-speakers/route.ts
import { GoogleGenAI, Type, Content } from "@google/genai";
import { NextResponse } from "next/server";

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

    // CAMBIO 1: Instanciación del SDK. (Se mantiene igual, pero es el primer paso)
    const ai = new GoogleGenAI(gemini_api_key);

    // CAMBIO 2: Creación de un objeto `config` centralizado.
    // Esto incluye `thinkingConfig` y mueve la configuración del modelo aquí.
    const config = {
      // Habilitamos el pensamiento del modelo para un análisis más profundo.
      thinkingConfig: {
        thinkingBudget: -1, // Presupuesto de pensamiento "ilimitado".
      },
      // Parámetros de generación que antes estaban en `generationConfig`.
      temperature: 0.7,
      topP: 0.9,
      topK: 30,
      maxOutputTokens: 20192,
      // Forzamos la salida a JSON con el esquema requerido.
      responseMimeType: "application/json",
      responseSchema: {
        type: Type.OBJECT, // Usamos `Type` del nuevo import.
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
      ? `
Información de contexto adicional para mejorar la precisión (por ejemplo, nombres que no se mencionan explícitamente):
${context}
`
      : '';

    const prompt = `
Analiza la siguiente transcripción de una reunión y extrae la siguiente información:

1.  **summary**: Un resumen general y breve sobre los temas principales tratados en la reunión.
2.  **speaker**: Una lista con cada hablante identificado, extrayendo para cada uno:
    *   **speaker_number_to_replace**: El número entero que aparece en la etiqueta [Speaker:<número>].
    *   **name**: El nombre del hablante, inferido del texto. Si no se puede determinar, usa "Desconocido".
    *   **role**: El rol o función del hablante (ej. "Secretaria de Despacho", "Concejal"). Si no se puede inferir, usa "Desconocido".
${contextInstruction}
Transcripción:
\`\`\`
${transcript}
\`\`\`

Devuelve únicamente un objeto JSON que cumpla con la estructura especificada y sin ningún texto adicional.
`;
    // CAMBIO 3: Formatear el prompt en el objeto `Content[]` requerido por la API.
    const contents: Content[] = [
        {
            role: 'user',
            parts: [{ text: prompt }]
        }
    ];

    // CAMBIO 4: Usar `generateContentStream` para activar `thinkingConfig`.
    const responseStream = await ai.models.generateContentStream({
        model: 'gemini-2.5-flash',
        config,
        contents,
    });
    
    // CAMBIO 5: Procesar el stream para obtener el JSON final, igual que en tu ejemplo anterior.
    let finalJsonResponse: string | null = null;
    for await (const chunk of responseStream) {
        if (chunk.text) {
            // El último chunk que no esté vacío contendrá el objeto JSON completo.
            finalJsonResponse = chunk.text;
        }
    }
    
    if (!finalJsonResponse) {
        return NextResponse.json({ error: "The AI did not produce any output." }, { status: 500 });
    }

    // --- El resto de tu lógica de negocio se mantiene, pero usando `finalJsonResponse` ---

    let parsedData;
    try {
      parsedData = JSON.parse(finalJsonResponse);
    } catch (error) {
      console.error("Error parsing JSON response from Gemini:", error);
      console.error("Raw response text:", finalJsonResponse);
      return NextResponse.json(
        {
          error: "Failed to parse data from Gemini API response.",
          rawResponse: finalJsonResponse,
        },
        { status: 500 },
      );
    }

    if (!parsedData || !parsedData.summary || !parsedData.speaker) {
      console.log("identify-speaker API route - Unexpected JSON format");
      return NextResponse.json(
        {
          error: "Unexpected JSON response format from Gemini API.",
          rawResponse: finalJsonResponse,
        },
        { status: 500 },
      );
    }

    let diarizedTranscript = transcript;
    
    for (const speakerItem of parsedData.speaker) {
      const speakerNumber = speakerItem.speaker_number_to_replace;
      const speakerName = speakerItem.name || "Hablante Desconocido";
      const speakerRole = speakerItem.role || "Rol Desconocido";
      const replacementText = `\n\n**${speakerName}, ${speakerRole}:**`;
      
      diarizedTranscript = diarizedTranscript.replaceAll(
        `[Speaker:${speakerNumber}]`,
        replacementText
      );
    }
    
    const summary = parsedData.summary;
    const speakersList = parsedData.speaker.map((sp: any) => ({
        name: sp.name || "Desconocido",
        role: sp.role || "Desconocido"
    }));
    
    console.log("identify-speaker API route - Successful Response");
    return NextResponse.json({
        diarizedTranscript: diarizedTranscript,
        summary: summary,
        speakers: speakersList
    }, { status: 200 });

  } catch (error: any) {
    console.error("Error in /api/identify-speakers:", error);
    return NextResponse.json({ error: "Failed to process request", details: error.message }, { status: 500 });
  }
}