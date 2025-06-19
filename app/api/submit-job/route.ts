// /app/api/submit-job/route.ts

import { NextResponse } from "next/server";
import { Client } from "@upstash/qstash";
import { createAdminClient } from "@/lib/supabase/admin"; 

// --- VERIFICACIÓN INICIAL AL CARGAR EL SERVIDOR ---
// Si alguna de estas falla, lo verás al iniciar `npm run dev`.
console.log("Módulo /api/submit-job/route.ts cargado.");
if (!process.env.QSTASH_TOKEN) {
  console.error("ERROR CRÍTICO: La variable de entorno QSTASH_TOKEN no está definida.");
}
if (!process.env.NEXT_PUBLIC_APP_URL) {
  console.error("ERROR CRÍTICO: La variable de entorno NEXT_PUBLIC_APP_URL no está definida.");
}
// --- FIN VERIFICACIÓN INICIAL ---

const UUID_REGEX = /^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$/;

export async function POST(req: Request) {
  console.log("\n\n--- INICIO DE PETICIÓN A /api/submit-job ---");

  try {
    // 1. Inicializando Clientes
    console.log("[Paso 1] Inicializando clientes de Supabase y QStash...");
    const supabase = createAdminClient();
    const qstashClient = new Client({ token: process.env.QSTASH_TOKEN! });
    console.log("[Paso 1] Clientes inicializados con éxito.");

    // 2. Parseando el Body
    console.log("[Paso 2] Parseando el cuerpo (body) de la petición...");
    const body = await req.json();
    console.log("[Paso 2] Body parseado con éxito.");

    // 3. Validando los Datos
    console.log("[Paso 3] Validando datos recibidos...");
    const { audioUrl, fileName, config, prompt, userId } = body;

    if (!audioUrl || !fileName || !config || !prompt || !userId || !UUID_REGEX.test(userId)) {
      console.error("[Paso 3] ¡FALLO DE VALIDACIÓN! Datos recibidos:", { audioUrl, fileName, config, prompt, userId });
      return NextResponse.json({ error: "Datos inválidos o faltantes." }, { status: 400 });
    }
    console.log("[Paso 3] Datos validados con éxito. UserID:", userId);

    // 4. Insertando en Supabase
    console.log("[Paso 4] Intentando insertar en la base de datos (tabla: processing_jobs)...");
    const { data: jobData, error: dbError } = await supabase
      .from('processing_jobs')
      .insert({ user_id: userId, status: 'submitted', file_name: fileName, audio_url: audioUrl })
      .select('id')
      .single();

    if (dbError) throw dbError; // Lanza el error de Supabase para que lo capture el catch
    console.log("[Paso 4] Inserción en Supabase exitosa. Job ID:", jobData.id);
    const jobId = jobData.id;

    // 5. Publicando en QStash
    const callbackUrl = `${process.env.NEXT_PUBLIC_APP_URL}/api/process-job`;
    console.log(`[Paso 5] Intentando publicar en QStash. Callback URL: ${callbackUrl}`);
    const { messageId } = await qstashClient.publishJSON({
      url: callbackUrl,
      body: { jobId, audioUrl, fileName, config, prompt, userId },
    });
    console.log("[Paso 5] Publicación en QStash exitosa. Message ID:", messageId);

    // 6. Respondiendo al Cliente
    console.log("[Paso 6] Enviando respuesta exitosa (202) al cliente.");
    console.log("--- FIN DE PETICIÓN (ÉXITO) ---\n");
    return NextResponse.json({ status: 'submitted', jobId }, { status: 202 });

  } catch (error: any) {
    // ESTE BLOQUE ES EL MÁS IMPORTANTE SI ALGO FALLA
    console.error("\n\n!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!");
    console.error("!!!!!!      ERROR INESPERADO       !!!!!!");
    console.error("!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!");
    console.error("El proceso falló. Aquí está el objeto de error completo:");
    console.error(error);
    console.error("--- Fin del reporte de error ---\n");
    
    return NextResponse.json({ error: "Error interno del servidor.", details: error.message }, { status: 500 });
  }
}