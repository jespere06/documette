import { type NextRequest, NextResponse } from "next/server"

export async function POST(request: NextRequest) {
  try {
    const actaData = await request.json()

    // Generar contenido del documento
    const docContent = `
ACTA DE REUNIÓN

Título: ${actaData.title}
Fecha: ${new Date(actaData.date).toLocaleDateString("es-ES")}
Participantes: ${actaData.participants.join(", ")}

RESUMEN EJECUTIVO
${actaData.summary}

ACUERDOS Y DECISIONES
${actaData.agreements.map((agreement: string, index: number) => `${index + 1}. ${agreement}`).join("\n")}

TRANSCRIPCIÓN COMPLETA
${actaData.transcript}

---
Documento generado automáticamente por Documette
    `.trim()

    // Crear un blob con el contenido (simulando .docx)
    const blob = new Blob([docContent], {
      type: "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
    })

    return new NextResponse(blob, {
      headers: {
        "Content-Type": "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
        "Content-Disposition": `attachment; filename="acta-${actaData.title.replace(/\s+/g, "-").toLowerCase()}.docx"`,
      },
    })
  } catch (error) {
    console.error("Error generando documento:", error)
    return NextResponse.json({ error: "Error generando el documento" }, { status: 500 })
  }
}
