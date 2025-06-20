// ruta: app/api/generate-acta-callback/route.ts

import { NextResponse, NextRequest } from 'next/server';
import { createAdminClient } from '@/lib/supabase/admin';

export const dynamic = "force-dynamic";

export async function POST(req: NextRequest) {
    // 1. Verificación de Seguridad: Asegurarse de que la llamada viene de nuestro servicio de Cloud Run.
    const secret = req.nextUrl.searchParams.get('secret');
    if (secret !== process.env.CALLBACK_SECRET) {
        console.warn("Llamada a callback de 'generate-acta' con secreto inválido.");
        return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    try {
        // 2. Extraer los datos finales del cuerpo de la petición.
        const { actaId, markdown, agreements } = await req.json();

        // Validar que tenemos todo lo que necesitamos.
        if (!actaId || !markdown || !agreements) {
            console.error("Payload incompleto recibido en el callback final:", { actaId, markdown, agreements });
            return NextResponse.json({ error: "Faltan datos en el payload del callback final." }, { status: 400 });
        }

        console.log(`[Callback Final] Contenido del acta recibido para: ${actaId}`);

        // 3. Actualizar la base de datos con los datos finales. Este es el paso crucial.
        const supabase = await createAdminClient();
        console.log(`[Callback Final] Actualizando acta ${actaId} en Supabase con status 'generated'. ¡PROCESO COMPLETADO!`);
        
        const { error: updateError } = await supabase
            .from('actas')
            .update({
                markdown: markdown,
                agreements: agreements,
                status: 'generated' // ¡El estado final que el cliente está esperando!
            })
            .eq('id', actaId);
        
        if (updateError) {
            // Si la actualización final falla, es un problema serio.
            throw new Error(`Error en la actualización final del acta ${actaId} en Supabase: ${updateError.message}`);
        }

        // 4. ¡Misión cumplida! No hay un siguiente paso que disparar.
        // Simplemente respondemos a Cloud Run que hemos recibido y procesado todo correctamente.
        return NextResponse.json({ success: true, message: "Acta finalizada y registrada en la base de datos." });

    } catch (error: any) {
        console.error("[Callback Final] Error fatal procesando el callback de 'generate-acta':", error.message);
        
        // Como último recurso, intentamos marcar el acta como errónea para que el usuario no se quede esperando indefinidamente.
        try {
            const { actaId } = await req.clone().json(); // Clonamos por si el body ya fue leído.
            if (actaId) {
                const supabase = await createAdminClient();
                await supabase
                    .from('actas')
                    .update({ status: 'error', summary: 'Fallo durante el callback final de generación.' })
                    .eq('id', actaId);
            }
        } catch (e) {
            console.error("[Callback Final] No se pudo ni siquiera marcar el acta como errónea:", e);
        }
        
        return NextResponse.json({ error: "Internal Server Error", details: error.message }, { status: 500 });
    }
}