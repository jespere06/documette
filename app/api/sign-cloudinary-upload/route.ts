// app/api/sign-cloudinary-upload/route.ts
import { v2 as cloudinary } from 'cloudinary';
import { NextResponse } from 'next/server';

export async function POST(request: Request) {
  // Asegurarnos de que las variables de entorno están cargadas
  const cloudName = process.env.NEXT_PUBLIC_CLOUDINARY_CLOUD_NAME;
  const apiKey = process.env.NEXT_PUBLIC_CLOUDINARY_API_KEY;
  const apiSecret = process.env.CLOUDINARY_API_SECRET;

  if (!cloudName || !apiKey || !apiSecret) {
    console.error("Cloudinary environment variables are not set.");
    return NextResponse.json(
      { message: "Error de configuración del servidor." },
      { status: 500 }
    );
  }

  // Configura Cloudinary en cada solicitud para asegurar que usa las credenciales correctas
  cloudinary.config({
    cloud_name: cloudName,
    api_key: apiKey,
    api_secret: apiSecret,
  });

  try {
    const timestamp = Math.round(new Date().getTime() / 1000);
    const folder = 'audios_actas';

    // Estos son los parámetros que el frontend enviará a Cloudinary y que deben ser firmados.
    // El SDK los ordenará alfabéticamente para crear el string a firmar.
    const paramsToSign = {
      timestamp: timestamp,
      folder: folder,
    };

    const signature = cloudinary.utils.api_sign_request(paramsToSign, apiSecret);

    return NextResponse.json({ timestamp, signature });

  } catch (error) {
    console.error("Error al generar la firma de Cloudinary:", error);
    return NextResponse.json(
      { message: "No se pudo generar la firma para la subida" },
      { status: 500 }
    );
  }
}