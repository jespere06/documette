// Ubicación: app/api/generate-docx/route.ts

import { type NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

export async function POST(request: NextRequest) {
  try {
    // --- PASO 1 y 2: Obtener datos y crear cliente (sin cambios) ---
    const { markdown, userId } = await request.json();
    if (!markdown || !userId) {
      return NextResponse.json({ message: "Solicitud inválida" }, { status: 400 });
    }
    const supabaseAdmin = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.NEXT_SUPABASE_SERVICE_ROLE!
    );

    // --- PASO 3: Obtener el nombre de la función (sin cambios) ---
    const { data: userInfo, error: userError } = await supabaseAdmin.from("user_info").select("template_id").eq("user_id", userId).single();
    if (userError || !userInfo) {
      return NextResponse.json({ message: "Usuario o plantilla no encontrados" }, { status: 404 });
    }
    const { data: templateInfo, error: templateError } = await supabaseAdmin.from("templates").select("docx_template_function").eq("id", userInfo.template_id).single();
    if (templateError || !templateInfo || !templateInfo.docx_template_function) {
      return NextResponse.json({ message: "Función de plantilla no configurada" }, { status: 404 });
    }
    const docxFunctionName = templateInfo.docx_template_function;

    // --- INICIO DE LA CORRECCIÓN RADICAL: USAR FETCH DIRECTO ---
    
    // PASO 4: Construir la URL y usar fetch, como en tu código original que funcionaba.
    // Esto evita la "distorsión" de datos de supabase.functions.invoke() en el servidor.
    const functionUrl = `${process.env.NEXT_PUBLIC_SUPABASE_URL}/functions/v1/${docxFunctionName}`;
    const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;

    console.log(`Actuando como proxy, llamando a: ${functionUrl}`);

    const functionResponse = await fetch(functionUrl, {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${anonKey}`,
        },
        body: JSON.stringify({ text: markdown }),
    });

    if (!functionResponse.ok) {
        const errorText = await functionResponse.text();
        console.error(`La función Edge devolvió un error: ${functionResponse.status} ${errorText}`);
        return NextResponse.json({ message: `Error en el servidor de documentos: ${errorText}` }, { status: 502 });
    }

    // PASO 5: Obtener el Blob de la respuesta, el método más fiable.
    const docBlob = await functionResponse.blob();

    console.log("¡Blob recibido exitosamente desde la función! Devolviéndolo al cliente.");

    // PASO 6: Devolver el Blob directamente al cliente.
    return new Response(docBlob, {
        status: 200,
        headers: {
            "Content-Type": "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
        },
    });

  } catch (error: any) {
    console.error("--- ERROR INESPERADO EN LA RUTA PROXY /api/generate-docx ---", error);
    return NextResponse.json(
      { message: "Error interno del servidor.", details: error.message },
      { status: 500 }
    );
  }
}