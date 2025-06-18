// src/lib/process-orchestrator.ts
import { createClient } from "@supabase/supabase-js";
// ¡Importante! Usamos el cliente de servicio para que funcione en segundo plano
const supabaseAdmin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.NEXT_SUPABASE_SERVICE_ROLE!
);

// Esta función es el corazón de tu proceso secuencial
export async function runFullProcess(jobId: string) {
  console.log(`Iniciando proceso completo para el trabajo: ${jobId}`);

  try {
    // --- PASO 1: TRANSCRIPCIÓN ---
    let { data: job } = await supabaseAdmin.from('jobs').select('*').eq('id', jobId).single();
    if (!job) throw new Error("Trabajo no encontrado");
    
    // Aquí iría tu lógica real de API. Por simplicidad, la simulamos.
    // const transcript = await callDeepgramAPI(job.gcs_file_name);
    // Simulación:
    await new Promise(res => setTimeout(res, 15000)); // Simula una tarea de 15 segundos
    const transcript = "Este es el texto transcrito del audio.";
    
    await supabaseAdmin.from('jobs').update({ transcript, status: 'identifying' }).eq('id', jobId);
    console.log(`[${jobId}] Transcripción completada.`);

    // --- PASO 2: IDENTIFICAR HABLANTES ---
    // const { diarizedTranscript, speakers, summary } = await callGeminiToIdentify(transcript);
    await new Promise(res => setTimeout(res, 20000)); // Simula 20 segundos
    const diarizedTranscript = "[Speaker:0] Hola a todos. [Speaker:1] Hola, ¿qué tal?";
    const speakers = [{id: 0, name: "Juan"}, {id: 1, name: "Ana"}];
    const summary = "Resumen de la reunión.";

    await supabaseAdmin.from('jobs').update({ diarized_transcript: diarizedTranscript, speakers, summary, status: 'generating' }).eq('id', jobId);
    console.log(`[${jobId}] Identificación completada.`);

    // --- PASO 3: GENERAR ACTA ---
    // const { markdown, agreements } = await callGeminiToGenerate(diarizedTranscript, speakers);
    await new Promise(res => setTimeout(res, 25000)); // Simula 25 segundos
    const final_markdown = "## Acta de la Reunión\n- Acuerdo 1\n- Acuerdo 2";
    const agreements = ["Acuerdo 1", "Acuerdo 2"];
    
    await supabaseAdmin.from('jobs').update({ final_markdown, agreements, status: 'complete' }).eq('id', jobId);
    console.log(`[${jobId}] Proceso completado exitosamente.`);

  } catch (error: any) {
    console.error(`[${jobId}] Error en el proceso:`, error);
    await supabaseAdmin.from('jobs').update({ status: 'failed', error_message: error.message }).eq('id', jobId);
  }
}