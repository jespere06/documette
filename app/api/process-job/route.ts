// /app/api/process-job/route.ts
import { NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";

export async function POST(req: NextRequest) {
  // QStash puede reintentar, así que es importante que el endpoint pueda manejarlo.
  const body = await req.json();
  const { jobId, audioUrl, config, prompt, userId, fileName } = body;

  if (!jobId) {
    console.error("[process-job] Llamada recibida sin jobId. Abortando.");
    // Devolvemos un 200 para que QStash no reintente un mensaje malformado.
    return NextResponse.json({ error: "jobId es requerido" }, { status: 200 });
  }

  const supabase = createAdminClient();
  
  try {
    // --- INICIA EL PROCESO ---

    // 1. TRANSCRIPCIÓN
    await supabase.from('processing_jobs').update({ status: 'transcribing' }).eq('id', jobId);
    const transRes = await fetch(`${process.env.NEXT_PUBLIC_APP_URL}/api/transcribe`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ audioUrl, deepgram_api_key: config.deepgram_api_key }),
    });
    if (!transRes.ok) throw new Error(`Fallo en la transcripción: ${await transRes.text()}`);
    const { text: transcript } = await transRes.json();
    await supabase.from('processing_jobs').update({ transcript }).eq('id', jobId);

    // 2. IDENTIFICACIÓN DE HABLANTES (DIARIZACIÓN)
    await supabase.from('processing_jobs').update({ status: 'diarizing' }).eq('id', jobId);
    const identifyRes = await fetch(`${process.env.NEXT_PUBLIC_APP_URL}/api/identify-speakers`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ transcript, context: config.speaker_context, gemini_api_key: config.gemini_api_key }),
    });
    if (!identifyRes.ok) throw new Error(`Fallo identificando hablantes: ${await identifyRes.text()}`);
    const { diarizedTranscript, speakers, summary } = await identifyRes.json();
    await supabase.from('processing_jobs').update({ diarized_transcript: diarizedTranscript, speakers, summary }).eq('id', jobId);

    // 3. GENERACIÓN DEL ACTA
    await supabase.from('processing_jobs').update({ status: 'generating' }).eq('id', jobId);
    const genRes = await fetch(`${process.env.NEXT_PUBLIC_APP_URL}/api/generate-acta`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ transcript: diarizedTranscript, speakers, gemini_api_key: config.gemini_api_key, prompt }),
    });
    if (!genRes.ok) throw new Error(`Fallo generando el acta: ${await genRes.text()}`);
    const { markdown, agreements } = await genRes.json();
    if (!markdown) throw new Error('La IA no pudo generar el contenido del acta.');
    await supabase.from('processing_jobs').update({ markdown_result: markdown, agreements }).eq('id', jobId);

    // 4. GENERACIÓN DEL DOCUMENTO DOCX
    const docGenRes = await fetch(`${process.env.NEXT_PUBLIC_APP_URL}/api/generate-docx`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ markdown, userId }), // Asumiendo que generate-docx necesita el userId
    });
    if (!docGenRes.ok) throw new Error(`Fallo generando el DOCX: ${await docGenRes.text()}`);
    // Aquí asumimos que generate-docx devuelve una URL pública del DOCX guardado en algún storage.
    // Si devuelve el blob, necesitarías guardarlo en GCS/Supabase Storage y obtener la URL.
    // Por simplicidad, supongamos que devuelve una URL en el JSON.
    const { docxUrl } = await docGenRes.json(); 
    await supabase.from('processing_jobs').update({ result_doc_url: docxUrl }).eq('id', jobId);

    // 5. BORRADO DEL AUDIO ORIGINAL
    fetch(`${process.env.NEXT_PUBLIC_APP_URL}/api/delete-audio-gcs`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ fileName }), 
    }).catch(err => console.error(`[process-job] Fallo en el borrado en segundo plano del audio ${fileName}:`, err));
    
    // --- FINALIZACIÓN EXITOSA ---
    await supabase.from('processing_jobs').update({ status: 'complete' }).eq('id', jobId);
    console.log(`[process-job] Trabajo ${jobId} completado exitosamente.`);
    
    return NextResponse.json({ status: "Job completed" });

  } catch (error: any) {
    console.error(`[process-job] Error procesando el trabajo ${jobId}:`, error);
    // --- MANEJO DE ERRORES ---
    await supabase.from('processing_jobs').update({ 
        status: 'error',
        error_message: error.message 
    }).eq('id', jobId);
    
    // Devolvemos un 200 para que QStash no reintente un trabajo que ya sabemos que ha fallado.
    return NextResponse.json({ error: error.message }, { status: 200 });
  }
}