"use client"

import { useState, useEffect } from "react"
import { Button } from "@/components/ui/button"
import { Card } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { Textarea } from "@/components/ui/textarea"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import {
  Download,
  Edit3,
  Save,
  RotateCcw,
  Users,
  FileText,
  Copy,
  Mail,
  CheckCircle2,
  Calendar,
  Target,
  MessageSquare,
  Eye,
  Send,
  // Code, // Eliminado
} from "lucide-react"
import type { ActaData } from "@/app/page"

interface ActaEditorProps {
  actaData: ActaData
  onReset: () => void
  onUpdate: (data: ActaData) => void
  isLoadingExtraData?: boolean
}

export function ActaEditor({ actaData, onReset, onUpdate, isLoadingExtraData }: ActaEditorProps) {
  const [isEditing, setIsEditing] = useState(false)
  const [editedData, setEditedData] = useState<ActaData>(actaData)

  useEffect(() => {
    setEditedData(actaData);
  }, [actaData]);

  const handleSave = async () => {
    onUpdate(editedData)
    setIsEditing(false)
  }

  const handleDownload = () => {
    if (!editedData.docUrl) {
      console.error("No se encontró la URL del documento para descargar.")
      alert("Error: No se ha podido encontrar el archivo del documento.")
      return
    }
    
    let downloadableUrl = editedData.docUrl;
    if (downloadableUrl.startsWith("gs://")) {
        const bucketAndPath = downloadableUrl.substring(5);
        downloadableUrl = `https://storage.googleapis.com/${bucketAndPath}`;
    }

    const a = document.createElement("a")
    a.href = downloadableUrl 
    a.download = `acta-${editedData.title.replace(/\s+/g, "-").toLowerCase()}.docx`
    document.body.appendChild(a)
    a.click()
    document.body.removeChild(a)
  }
  
  const handleEmailShare = () => {
    const subject = `Acta de la reunión: ${editedData.title}`
    const body = `
Hola,

A continuación, se comparte el resumen del acta de la reunión "${editedData.title}" celebrada el ${new Date(editedData.date).toLocaleDateString("es-ES")}.

----------------------------------------
RESUMEN EJECUTIVO
----------------------------------------
${editedData.summary}

----------------------------------------
PARTICIPANTES
----------------------------------------
${editedData.participants.join(", ")}

----------------------------------------
ACUERDOS Y DECISIONES
----------------------------------------
${editedData.agreements.map((agreement, index) => `${index + 1}. ${agreement}`).join("\n")}

----------------------------------------

Puedes descargar el acta completa aquí: ${editedData.docUrl.startsWith("gs://") ? `https://storage.googleapis.com/${editedData.docUrl.substring(5)}` : editedData.docUrl}

Saludos.
    `.trim()

    const mailtoLink = `mailto:?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(body)}`
    window.location.href = mailtoLink
  }

  const renderFormattedTranscript = (text: string) => {
    if (!text || text.startsWith("Cargando") || text.startsWith("Error al cargar") || text === "Contenido no disponible.") {
        return <p className="text-slate-500 italic">{isLoadingExtraData && text.startsWith("Cargando") ? "Cargando transcripción..." : text}</p>;
    }
    const paragraphs = text.split("\n\n")
    return paragraphs.map((paragraph, pIndex) => (
      <p key={`p-${pIndex}`} className="mb-3 last:mb-0">
        {paragraph.split("**").map((chunk, cIndex) => {
          if (cIndex % 2 === 1) {
            return <strong key={`c-${cIndex}`}>{chunk}</strong>
          }
          return <span key={`c-${cIndex}`}>{chunk}</span>
        })}
      </p>
    ))
  }

  const isContentLoadingOrError = (content: string) => {
    return !content || content.startsWith("Cargando") || content.startsWith("Error al cargar") || content === "Contenido no disponible.";
  }

  return (
    <div className="space-y-4">
      <Card className="p-3 bg-white border border-slate-200">
        <div className="flex items-center justify-between">
          <div className="flex items-center space-x-2">
            <CheckCircle2 className="w-4 h-4 text-slate-900" />
            <div>
              <h2 className="font-semibold text-slate-900 text-sm">Acta generada exitosamente</h2>
              <p className="text-xs text-slate-600">
                {editedData.participants.length} participantes • {editedData.agreements.length} acuerdos
              </p>
            </div>
          </div>
          <div className="flex items-center space-x-2">
            {isEditing && (
              <Button size="sm" onClick={handleSave} className="bg-slate-900 hover:bg-slate-800 text-white px-3 py-1">
                <Save className="w-3 h-3 mr-1" />
                Guardar
              </Button>
            )}
            <Button size="sm" variant="outline" onClick={() => setIsEditing(!isEditing)} className="border-slate-300 px-3 py-1">
              <Edit3 className="w-3 h-3 mr-1" />
              {isEditing ? "Cancelar" : "Editar"}
            </Button>
            <Button size="sm" onClick={handleDownload} className="bg-slate-900 hover:bg-slate-800 text-white px-3 py-1" disabled={!editedData.docUrl}>
              <Download className="w-3 h-3 mr-1" />
              Descargar
            </Button>
          </div>
        </div>
      </Card>
      <div className="grid lg:grid-cols-3 gap-4">
        <div className="space-y-4">
          <Card className="p-3 bg-slate-50 border border-slate-200">
            <div className="space-y-3">
              <div className="flex items-center space-x-2 pb-2 border-b border-slate-200">
                <Calendar className="w-4 h-4 text-slate-600" />
                <h3 className="font-semibold text-slate-900 text-sm">Información</h3>
              </div>
              <div className="space-y-2">
                <div>
                  <label className="block text-xs font-medium text-slate-700 mb-1">Título</label>
                  {isEditing ? (
                    <Input value={editedData.title} onChange={(e) => setEditedData({ ...editedData, title: e.target.value })} className="border-slate-300 text-xs h-8" />
                  ) : (
                    <p className="font-medium text-slate-900 text-xs leading-relaxed">{editedData.title}</p>
                  )}
                </div>
                <div>
                  <label className="block text-xs font-medium text-slate-700 mb-1">Fecha</label>
                  {isEditing ? (
                    <Input type="date" value={editedData.date} onChange={(e) => setEditedData({ ...editedData, date: e.target.value })} className="border-slate-300 text-xs h-8" />
                  ) : (
                    <p className="text-slate-700 text-xs">{new Date(editedData.date + 'T00:00:00').toLocaleDateString("es-ES", { day: "numeric", month: "short", year: "numeric" })}</p>
                  )}
                </div>
              </div>
            </div>
          </Card>
          <Card className="p-3 bg-slate-50 border border-slate-200">
            <div className="space-y-2">
              <div className="flex items-center space-x-2 pb-2 border-b border-slate-200">
                <Users className="w-4 h-4 text-slate-600" />
                <h3 className="font-semibold text-slate-900 text-sm">Participantes ({editedData.participants.length})</h3>
              </div>
              <div className="space-y-1 max-h-32 overflow-y-auto">
                {editedData.participants.map((participant, index) => (
                  <div key={index} className="flex items-center space-x-2 text-xs">
                    <div className="w-4 h-4 bg-slate-200 rounded-full flex items-center justify-center">
                      <span className="text-xs font-bold text-slate-600">{index + 1}</span>
                    </div>
                    <span className="text-slate-900 font-medium">{participant}</span>
                  </div>
                ))}
              </div>
            </div>
          </Card>
          <div className="flex flex-col space-y-2">
            <Button variant="outline" size="sm" onClick={onReset} className="border-slate-300 text-slate-600 justify-start">
              <RotateCcw className="w-3 h-3 mr-2" /> Nueva grabación
            </Button>
          </div>
        </div>
        <div className="lg:col-span-2">
          <Card className="overflow-hidden border border-slate-200">
            <Tabs defaultValue="overview" className="w-full">
              {/* Ajustado a grid-cols-3 ya que se eliminó Markdown */}
              <TabsList className="grid w-full grid-cols-3 bg-slate-50 border-b border-slate-200 p-0"> 
                <TabsTrigger value="overview" className="data-[state=active]:bg-white data-[state=active]:border-b-2 data-[state=active]:border-slate-900 font-medium py-2 text-xs">
                  <Eye className="w-3 h-3 mr-1" /> Resumen
                </TabsTrigger>
                <TabsTrigger value="transcript" className="data-[state=active]:bg-white data-[state=active]:border-b-2 data-[state=active]:border-slate-900 font-medium py-2 text-xs">
                  <MessageSquare className="w-3 h-3 mr-1" /> Transcripción
                </TabsTrigger>
                <TabsTrigger value="export" className="data-[state=active]:bg-white data-[state=active]:border-b-2 data-[state=active]:border-slate-900 font-medium py-2 text-xs">
                  <Send className="w-3 h-3 mr-1" /> Exportar
                </TabsTrigger>
              </TabsList>
              <TabsContent value="overview" className="p-4 space-y-4">
                <div className="space-y-2">
                  <div className="flex items-center space-x-2">
                    <div className="w-5 h-5 bg-slate-900 rounded flex items-center justify-center">
                      <FileText className="w-3 h-3 text-white" />
                    </div>
                    <h3 className="font-semibold text-slate-900 text-sm">Resumen Ejecutivo</h3>
                  </div>
                  {isEditing ? (
                    <Textarea value={editedData.summary} onChange={(e) => setEditedData({ ...editedData, summary: e.target.value })} rows={4} className="border-slate-300 text-xs" />
                  ) : (
                    <Card className="p-3 bg-slate-50 border border-slate-200">
                      <p className="text-slate-800 leading-relaxed text-xs whitespace-pre-line">{editedData.summary}</p>
                    </Card>
                  )}
                </div>
                <div className="space-y-2">
                  <div className="flex items-center space-x-2">
                    <div className="w-5 h-5 bg-slate-900 rounded flex items-center justify-center">
                      <Target className="w-3 h-3 text-white" />
                    </div>
                    <h3 className="font-semibold text-slate-900 text-sm">Acuerdos y Decisiones ({editedData.agreements.length})</h3>
                  </div>
                  {isEditing ? (
                    <Textarea value={editedData.agreements.join("\n")} onChange={(e) => setEditedData({ ...editedData, agreements: e.target.value.split("\n").filter((a) => a.trim()), })} rows={6} placeholder="Un acuerdo por línea" className="border-slate-300 text-xs" />
                  ) : (
                    <div className="space-y-2 max-h-48 overflow-y-auto">
                      {editedData.agreements.map((agreement, index) => (
                        <div key={index} className="flex items-start space-x-2 p-2 bg-slate-50 rounded border border-slate-200">
                          <div className="w-5 h-5 bg-slate-900 text-white rounded flex items-center justify-center font-bold text-xs mt-0.5">{index + 1}</div>
                          <p className="text-slate-800 flex-1 text-xs leading-relaxed whitespace-pre-line">{agreement}</p>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              </TabsContent>
              <TabsContent value="transcript" className="p-4">
                <div className="space-y-3">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center space-x-2">
                      <div className="w-5 h-5 bg-slate-900 rounded flex items-center justify-center">
                        <MessageSquare className="w-3 h-3 text-white" />
                      </div>
                      <h3 className="font-semibold text-slate-900 text-sm">Transcripción Completa</h3>
                    </div>
                    <Button variant="outline" size="sm" onClick={() => navigator.clipboard.writeText(editedData.transcript)} className="border-slate-300 text-xs px-2 py-1" disabled={isContentLoadingOrError(editedData.transcript)}>
                      <Copy className="w-3 h-3 mr-1" /> Copiar
                    </Button>
                  </div>
                  {isEditing ? (
                    <Textarea value={editedData.transcript} onChange={(e) => setEditedData({ ...editedData, transcript: e.target.value })} rows={12} className="font-mono text-xs border-slate-300" />
                  ) : (
                    <Card className="p-3 bg-slate-50 border border-slate-200">
                      <div className="max-h-64 overflow-y-auto">
                        <div className="text-xs text-slate-800 font-mono leading-relaxed">
                          {renderFormattedTranscript(editedData.transcript)}
                        </div>
                      </div>
                    </Card>
                  )}
                </div>
              </TabsContent>
              {/* TabsContent para Markdown eliminado */}
              <TabsContent value="export" className="p-4">
                <div className="space-y-3">
                  <h3 className="font-semibold text-slate-900 text-sm">Opciones de Exportación</h3>
                  <div className="grid grid-cols-2 gap-3">
                    <Card className="p-3 cursor-pointer border border-slate-200 hover:border-slate-300 transition-colors" onClick={handleDownload}>
                      <div className="text-center space-y-2">
                        <div className="w-8 h-8 bg-slate-100 rounded-lg flex items-center justify-center mx-auto">
                          <FileText className="w-4 h-4 text-slate-600" />
                        </div>
                        <div>
                          <h4 className="font-medium text-slate-900 text-xs">Documento Word</h4>
                          <p className="text-slate-600 text-xs">Descarga .docx</p>
                        </div>
                        <Button size="sm" className="w-full bg-slate-900 hover:bg-slate-800 text-white py-1 text-xs" onClick={handleDownload} disabled={!editedData.docUrl}>
                          <Download className="w-3 h-3 mr-1" /> Descargar
                        </Button>
                      </div>
                    </Card>
                    <Card className="p-3 cursor-pointer border border-slate-200 hover:border-slate-300 transition-colors" onClick={handleEmailShare}>
                      <div className="text-center space-y-2">
                        <div className="w-8 h-8 bg-slate-100 rounded-lg flex items-center justify-center mx-auto">
                          <Mail className="w-4 h-4 text-slate-600" />
                        </div>
                        <div>
                          <h4 className="font-medium text-slate-900 text-xs">Envío Email</h4>
                          <p className="text-slate-600 text-xs">Compartir por correo</p>
                        </div>
                        <Button variant="outline" size="sm" className="w-full border-slate-300 py-1 text-xs" onClick={handleEmailShare} disabled={!editedData.docUrl}>
                          <Mail className="w-3 h-3 mr-1" /> Enviar
                        </Button>
                      </div>
                    </Card>
                  </div>
                </div>
              </TabsContent>
            </Tabs>
          </Card>
        </div>
      </div>
    </div>
  )
}