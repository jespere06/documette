"use client"

import { useState, useCallback, useEffect } from "react"
import { useDropzone } from "react-dropzone"
import { Button } from "@/components/ui/button"
import { Card } from "@/components/ui/card"
import { Upload, FileAudio, AlertCircle, Clock, Headphones, FileText, Shield } from "lucide-react"
import { Alert, AlertDescription } from "@/components/ui/alert"
import { createClient } from "@/lib/supabase/client"

// CAMBIO 1: Añadir 'disabled' a las props que el componente espera recibir.
interface AudioUploadProps {
  onFileUpload: (file: File) => void
  disabled: boolean
}

// CAMBIO 2: Recibir la prop 'disabled'.
export function AudioUpload({ onFileUpload, disabled }: AudioUploadProps) {
  const [error, setError] = useState<string | null>(null)
  const [outputFormat, setOutputFormat] = useState<string | null>(null)
  const [loadingFormat, setLoadingFormat] = useState<boolean>(true)

  const onDrop = useCallback(
    (acceptedFiles: File[]) => {
      if (disabled) return
  
      setError(null)
  
      if (acceptedFiles.length === 0) {
        setError("Por favor selecciona un archivo de audio válido")
        return
      }
  
      const file = acceptedFiles[0]
  
      if (!file.type.startsWith("audio/")) {
        setError("El archivo debe ser de audio (.mp3, .wav, .m4a)")
        return
      }
  
      // Sin límite de tamaño
      onFileUpload(file)
    },
    [onFileUpload, disabled],
  )
  

  const { getRootProps, getInputProps, isDragActive } = useDropzone({
    onDrop,
    accept: {
      "audio/*": [".mp3", ".wav", ".m4a", ".ogg"],
    },
    multiple: false,
    // CAMBIO 3: Pasar la propiedad 'disabled' al hook para deshabilitar la funcionalidad.
    disabled,
  })

  useEffect(() => {
    const fetchUserTemplateName = async () => {
      setLoadingFormat(true)
      const supabase = createClient()
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) {
        setOutputFormat(null)
        setLoadingFormat(false)
        return
      }
      const { data: userInfo } = await supabase
        .from("user_info")
        .select("template_id")
        .eq("user_id", user.id)
        .single()
      if (!userInfo?.template_id) {
        setOutputFormat(null)
        setLoadingFormat(false)
        return
      }
      const { data: template } = await supabase
        .from("templates")
        .select("name")
        .eq("id", userInfo.template_id)
        .single()
      setOutputFormat(template?.name || null)
      setLoadingFormat(false)
    }
    fetchUserTemplateName()
  }, [])

  const features = [
    { icon: Headphones, title: "Transcripción precisa", description: "Reconocimiento de voz avanzado", color: "bg-blue-100", iconColor: "text-blue-700" },
    { icon: FileText, title: "Formato estructurado", description: "Actas organizadas y profesionales", color: "bg-emerald-100", iconColor: "text-emerald-700" },
    { icon: Shield, title: "Procesamiento seguro", description: "Datos protegidos y privados", color: "bg-slate-100", iconColor: "text-slate-700" },
  ]

  return (
    // CAMBIO 4: Aplicar un estilo de opacidad a todo el componente cuando esté deshabilitado.
    <div className={`space-y-6 transition-opacity duration-300 ${disabled ? 'opacity-50' : ''}`}>
      <div className="text-center">
        <div className="inline-flex items-center space-x-2 bg-slate-100 border border-slate-200 rounded-lg px-4 py-2">
          <FileText className="w-4 h-4 text-slate-600" />
          <span className="text-sm text-slate-700 font-light">
            Formato:{" "}
            <span className="font-medium">
              {loadingFormat ? "Cargando formato..." : outputFormat ? `"${outputFormat}"` : "Formato no asignado"}
            </span>
          </span>
        </div>
      </div>
      <div className="text-center space-y-3">
        <h1 className="text-2xl font-light text-slate-900 leading-relaxed">
          Transforma reuniones en
          <span className="block text-slate-700 font-normal">documentos estructurados</span>
        </h1>
        <p className="text-slate-600 max-w-2xl mx-auto font-light">
          Sube tu grabación y obtén actas profesionales organizadas automáticamente.
        </p>
      </div>
      <Card className="relative overflow-hidden border-slate-200 bg-white">
        <div
          {...getRootProps()}
          // CAMBIO 5: Cambiar las clases CSS para reflejar el estado deshabilitado (sin hover, cursor de no permitido).
          className={`relative p-6 border-2 border-dashed transition-all duration-300 ${
            disabled
              ? 'border-slate-200 bg-slate-50 cursor-not-allowed'
              : isDragActive
                ? 'border-slate-400 bg-slate-50 cursor-pointer'
                : 'border-slate-300 hover:border-slate-400 hover:bg-slate-50 cursor-pointer'
          }`}
        >
          <input {...getInputProps()} />
          <div className="text-center space-y-4">
            <div className="mx-auto w-12 h-12">
              <div
                className={`w-12 h-12 rounded-xl flex items-center justify-center transition-all duration-300 ${
                  isDragActive && !disabled ? "bg-slate-100" : "bg-slate-50"
                }`}
              >
                {isDragActive && !disabled ? <Upload className="w-6 h-6 text-slate-600" /> : <FileAudio className="w-6 h-6 text-slate-500" />}
              </div>
            </div>
            <div className="space-y-2">
              <h3 className="text-lg font-light text-slate-800">
                {isDragActive && !disabled ? "Suelta tu archivo aquí" : "Arrastra tu grabación"}
              </h3>
              <p className="text-slate-500 font-light text-sm">O selecciona desde tu dispositivo</p>
            </div>
            <div className="flex flex-wrap justify-center gap-2">
              {["MP3", "WAV", "M4A", "OGG"].map((format) => (
                <span key={format} className="px-2 py-1 bg-slate-100 text-slate-700 rounded text-xs font-medium border border-slate-200">
                  {format}
                </span>
              ))}
            </div>
            <Button
              size="sm"
              className="bg-slate-800 hover:bg-slate-900 text-white px-4 py-2 text-sm font-medium transition-all duration-300"
              // CAMBIO 6: Deshabilitar el botón explícitamente.
              disabled={disabled}
            >
              <Upload className="w-4 h-4 mr-2" />
              Seleccionar archivo
            </Button>
            <p className="text-xs text-slate-400 font-light">Hasta 200MB • Procesamiento confidencial</p>
          </div>
        </div>
      </Card>
      {error && (
        <Alert variant="destructive" className="border-red-200 bg-red-50">
          <AlertCircle className="h-4 w-4" />
          <AlertDescription className="text-red-800 font-light">{error}</AlertDescription>
        </Alert>
      )}
      <div className="grid md:grid-cols-3 gap-4">
        {features.map((feature, index) => (
          <div key={index} className="text-center space-y-2 p-3">
            <div className={`w-10 h-10 ${feature.color} rounded-xl flex items-center justify-center mx-auto`}>
              <feature.icon className={`w-5 h-5 ${feature.iconColor}`} />
            </div>
            <h3 className="font-medium text-slate-900 text-sm">{feature.title}</h3>
            <p className="text-slate-600 font-light text-xs leading-relaxed">{feature.description}</p>
          </div>
        ))}
      </div>
      <div className="bg-blue-50 border border-blue-200 rounded-lg p-3">
        <div className="flex items-center justify-center space-x-4 text-xs text-slate-700 font-light">
          <div className="flex items-center space-x-1">
            <Clock className="w-3 h-3 text-blue-600" />
            <span>Procesamiento rápido</span>
          </div>
          <div className="flex items-center space-x-1">
            <FileText className="w-3 h-3 text-blue-600" />
            <span>Formato profesional</span>
          </div>
          <div className="flex items-center space-x-1">
            <Shield className="w-3 h-3 text-blue-600" />
            <span>Datos protegidos</span>
          </div>
        </div>
      </div>
    </div>
  )
}