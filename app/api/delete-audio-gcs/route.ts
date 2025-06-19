// Ruta: src/app/api/delete-audio-gcs/route.ts

import { NextRequest, NextResponse } from 'next/server';
import { Storage } from '@google-cloud/storage';

export async function POST(req: NextRequest) {
  try {
    // 1. Obtenemos el nombre del archivo que queremos borrar.
    const { fileName } = await req.json();

    if (!fileName) {
      return NextResponse.json({ error: 'Falta el nombre del archivo (fileName).' }, { status: 400 });
    }

    // 2. Inicializamos el cliente de Google Cloud Storage con nuestras credenciales.
    const storage = new Storage({
      projectId: process.env.GCS_PROJECT_ID,
      credentials: {
        client_email: process.env.GCS_CLIENT_EMAIL,
        private_key: process.env.GCS_PRIVATE_KEY?.replace(/\\n/g, '\n'),
      },
    });

    // 3. Apuntamos al archivo específico y lo borramos.
    console.log(`Solicitud recibida para borrar el archivo: ${fileName}`);
    await storage.bucket(process.env.GCS_BUCKET_NAME!).file(fileName).delete();
    console.log(`Archivo ${fileName} borrado exitosamente del bucket.`);

    // 4. Devolvemos una respuesta de éxito.
    return NextResponse.json({ message: 'Archivo borrado exitosamente.' }, { status: 200 });

  } catch (error: any) {
    // Manejo de errores.
    console.error('Error al borrar el archivo de GCS:', error);
    return NextResponse.json({ error: `Error interno del servidor: ${error.message}` }, { status: 500 });
  }
}