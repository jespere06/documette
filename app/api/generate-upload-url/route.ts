// Ruta: src/app/api/generate-upload-url/route.ts

import { NextRequest, NextResponse } from 'next/server';
import { Storage } from '@google-cloud/storage';

export async function POST(req: NextRequest) {
  try {
    const { fileName: originalFileName, contentType } = await req.json();

    if (!originalFileName || !contentType) {
      return NextResponse.json({ error: 'Faltan fileName o contentType' }, { status: 400 });
    }

    // [CAMBIO CLAVE] Vamos a usar un nombre de archivo único para evitar colisiones
    // y asegurarnos de que lo devolvemos correctamente.
    const uniqueFileName = `${Date.now()}-${originalFileName.replace(/\s/g, '_')}`;

    const storage = new Storage({
      projectId: process.env.GCS_PROJECT_ID,
      credentials: {
        client_email: process.env.GCS_CLIENT_EMAIL,
        private_key: process.env.GCS_PRIVATE_KEY?.replace(/\\n/g, '\n'),
      },
    });

    const bucket = storage.bucket(process.env.GCS_BUCKET_NAME!);
    const file = bucket.file(uniqueFileName); // Usamos el nombre único

    const options = {
      version: 'v4' as const,
      action: 'write' as const,
      expires: Date.now() + 15 * 60 * 1000,
      contentType: contentType,
    };

    const [signedUrl] = await file.getSignedUrl(options);
    
    // La URL pública ahora también usa el nombre único
    const publicUrl = `https://storage.googleapis.com/${bucket.name}/${uniqueFileName}`;

    // [CAMBIO CLAVE] Devolvemos explícitamente el 'uniqueFileName'
    return NextResponse.json({
      signedUrl,
      publicUrl,
      fileName: uniqueFileName, // Aseguramos que la propiedad 'fileName' se envíe
    });

  } catch (error: any) {
    console.error('Error generando URL firmada:', error);
    return NextResponse.json({ error: `Error interno del servidor: ${error.message}` }, { status: 500 });
  }
}