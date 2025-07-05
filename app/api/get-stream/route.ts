import { NextRequest, NextResponse } from 'next/server';

// Lee la URL de tu servicio backend (GCR) desde las variables de entorno.
// Es crucial que este valor esté configurado en tu entorno de despliegue (Vercel, etc.).
const GCR_SERVICE_URL = process.env.GCR_SERVICE_URL;

/**
 * Maneja las peticiones GET para obtener la información de un stream de YouTube.
 * Esta ruta de API actúa como un proxy seguro que:
 * 1. Oculta la lógica y la URL de tu servicio backend.
 * 2. Captura de forma segura la IP real del cliente.
 * 3. Reenvía esa IP a tu backend para que pueda realizar la petición a YouTube correctamente.
 */
export async function GET(req: NextRequest) {
  // --- 1. Extracción y Validación de Parámetros ---
  const { searchParams } = new URL(req.url);
  const url = searchParams.get('url');

  if (!url) {
    return NextResponse.json({ error: 'URL parameter is required' }, { status: 400 });
  }

  // --- 2. Validación de la Configuración del Servidor ---
  if (!GCR_SERVICE_URL) {
    console.error('[API get-stream] FATAL: GCR_SERVICE_URL is not configured in environment variables.');
    return NextResponse.json({ error: 'Server configuration error' }, { status: 500 });
  }

  // --- 3. Obtención Segura de la IP del Cliente ---
  // Este es el paso más importante. En un entorno de producción (Vercel, AWS, etc.),
  // la petición pasa por proxies. La IP real del cliente se añade al header 'x-forwarded-for'.
  // Confiamos en el valor que Vercel (o tu proveedor de nube) añade, que es el primero en la lista.
  const forwardedFor = req.headers.get('x-forwarded-for');
  
  // Se extrae la primera IP de la lista, que corresponde al cliente original.
  const userIp = forwardedFor ? forwardedFor.split(',')[0].trim() : req.headers.get('x-real-ip');

  if (!userIp) {
    // Si no podemos determinar la IP, denegamos la solicitud para evitar usar la IP del servidor.
    console.warn('[API get-stream] Could not determine client IP address from headers.');
    return NextResponse.json({ error: 'Could not determine client IP address' }, { status: 400 });
  }

  try {
    // --- 4. Preparación de la Petición al Backend ---
    const targetUrl = new URL(GCR_SERVICE_URL);
    targetUrl.searchParams.set('url', url);

    console.log(`[API get-stream] Forwarding request for YouTube URL: ${url} on behalf of IP: ${userIp}`);

    // --- 5. Llamada al Servicio Backend (GCR) con la IP del Cliente ---
    // Se reenvía la IP del cliente en el header 'X-Forwarded-For'. Tu servicio GCR
    // DEBE leer este header y usarlo para su propia petición a YouTube.
    const gcrResponse = await fetch(targetUrl.toString(), {
      method: 'GET',
      headers: {
        'X-Forwarded-For': userIp,
      },
    });
    
    // --- 6. Manejo de la Respuesta del Backend ---
    if (!gcrResponse.ok) {
      const errorBody = await gcrResponse.text().catch(() => 'Could not retrieve error body from GCR service.');
      console.error(`[API get-stream] Backend service responded with status ${gcrResponse.status}. Body: ${errorBody}`);
      return NextResponse.json(
        { error: 'The backend service failed to process the request.', details: errorBody },
        { status: gcrResponse.status }
      );
    }

    const data = await gcrResponse.json();
    const { title, stream_url } = data;

    if (!stream_url) {
      console.error('[API get-stream] No stream_url received from GCR service.');
      return NextResponse.json({ error: 'The backend service did not return a valid stream URL.' }, { status: 502 }); // 502 Bad Gateway
    }

    // --- 7. Éxito: Devolver la Información al Frontend ---
    return NextResponse.json({ title, stream_url });

  } catch (error: any) {
    console.error('[API get-stream] An unexpected network or system error occurred:', error);
    return NextResponse.json(
      { error: 'An internal server error occurred while communicating with the backend.' },
      { status: 500 }
    );
  }
}

/**
 * Maneja las peticiones OPTIONS (pre-flight) para CORS.
 * Es una buena práctica tenerlo, especialmente si el frontend y backend
 * pudieran estar en dominios diferentes en el futuro.
 */
export async function OPTIONS() {
  return new NextResponse(null, {
    status: 204, // No Content
    headers: {
      'Access-Control-Allow-Origin': '*', // Para producción, considera restringir a tu dominio: 'https://www.tu-dominio.com'
      'Access-Control-Allow-Methods': 'GET, OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type',
    },
  });
}