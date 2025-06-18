// app/api/delete-audio/route.ts
import { v2 as cloudinary } from 'cloudinary';
import { NextResponse } from 'next/server';
// Opcional: para proteger la ruta, puedes usar un helper de autenticación
// import { getSession } from 'next-auth/react'; o similar con Supabase

export async function POST(request: Request) {
  // Opcional pero recomendado: Verificar que el usuario esté autenticado
  // const session = await getSession({ req: request });
  // if (!session) {
  //   return NextResponse.json({ message: 'No autorizado' }, { status: 401 });
  // }
  
  // Configura Cloudinary con TODAS las credenciales
  cloudinary.config({
    cloud_name: process.env.NEXT_PUBLIC_CLOUDINARY_CLOUD_NAME,
    api_key: process.env.NEXT_PUBLIC_CLOUDINARY_API_KEY,
    api_secret: process.env.CLOUDINARY_API_SECRET,
  });

  try {
    const { publicId } = await request.json();

    if (!publicId) {
      return NextResponse.json({ message: 'publicId es requerido' }, { status: 400 });
    }

    // Llama a la función de borrado de Cloudinary
    // ¡IMPORTANTE! Para audio y video, el resource_type es 'video'
    const result = await cloudinary.uploader.destroy(publicId, {
      resource_type: 'video',
    });

    console.log('Resultado del borrado de Cloudinary:', result);

    if (result.result !== 'ok' && result.result !== 'not found') {
        // 'not found' es un éxito si el archivo ya fue borrado
        throw new Error('No se pudo borrar el archivo de Cloudinary.');
    }

    return NextResponse.json({ message: 'Archivo borrado exitosamente', data: result });

  } catch (error: any) {
    console.error("Error borrando archivo de Cloudinary:", error);
    return NextResponse.json({ message: "Error interno del servidor al borrar el archivo" }, { status: 500 });
  }
}