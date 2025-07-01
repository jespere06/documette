// app/api/sign-gcs-upload/route.ts
// 
import { NextResponse } from 'next/server';
import { Storage } from '@google-cloud/storage';
import { createClient } from '@/lib/supabase/server'; // TODO: ESTO SERA LOCAL YA QUE SERA UNA PETICION AL SERVIDOR

// Función para extraer la extensión del archivo
const getFileExtension = (fileName: string): string => {
  const lastDot = fileName.lastIndexOf('.');
  if (lastDot === -1) return ''; // No hay extensión
  return fileName.substring(lastDot + 1);
};

export async function POST(request: Request) {
  try {
    const supabase = await createClient();
    
    // 1. Obtener el usuario autenticado desde Supabase (más seguro que confiar en el cliente)
    const { data: { user }, error: userError } = await supabase.auth.getUser();
    if (userError || !user) {
      return NextResponse.json({ message: 'No autenticado.' }, { status: 401 });
    }

    // 2. Validar y parsear el cuerpo de la solicitud
    const { jobId, fileName, fileType } = await request.json();
    if (!jobId || !fileName || !fileType) {
      return NextResponse.json({ message: 'Faltan los parámetros jobId, fileName o fileType.' }, { status: 400 });
    }
    
    // 3. Configurar el cliente de GCS
    if (!process.env.GCS_BUCKET_NAME) {
      throw new Error("El nombre del bucket de GCS no está configurado.");
    }

    const storage = new Storage({
      projectId: process.env.GCS_PROJECT_ID,
      credentials: {
        client_email: process.env.GCS_CLIENT_EMAIL,
        private_key: process.env.GCS_PRIVATE_KEY?.replace(/\\n/g, '\n'),
      },
    });

    const bucket = storage.bucket(process.env.GCS_BUCKET_NAME);
    const extension = getFileExtension(fileName);

    // 4. Construir la ruta del archivo según el nuevo formato
    const gcsPath = `audios/${user.id}/${jobId}.${extension}`;
    const file = bucket.file(gcsPath);

    // 5. Configurar opciones y generar la URL firmada
    const options = {
      version: 'v4' as const,
      action: 'write' as const,
      expires: Date.now() + 15 * 60 * 1000, // 15 minutos de validez
      contentType: fileType,
    };

    const [signedUrl] = await file.getSignedUrl(options);
    const publicUrl = `https://storage.googleapis.com/${bucket.name}/${file.name}`;

    // 6. Devolver las URLs
    return NextResponse.json({ signedUrl, publicUrl, gcsPath: file.name });

  } catch (error) {
    console.error('Error al generar la URL firmada de GCS:', error);
    const errorMessage = error instanceof Error ? error.message : 'Error desconocido';
    return NextResponse.json({ message: `Error en el servidor: ${errorMessage}` }, { status: 500 });
  }
}