"use client"

import { useEffect, useState } from "react"
import { Progress } from "@/components/ui/progress"
import { Card } from "@/components/ui/card"
import { Loader2, Headphones, Users, FileText, Zap, UploadCloud } from "lucide-react" // [1] Importa un nuevo ícono
import type { ProcessingStep } from "@/app/page"

interface ProcessingViewProps {
  step: ProcessingStep
  progress: number
  fileName: string
  fileSize: number
}

export function ProcessingView({ step, progress, fileName, fileSize }: ProcessingViewProps) {
  const [currentTime, setCurrentTime] = useState(0)
  const [estimatedTime, setEstimatedTime] = useState(180)

  useEffect(() => {
    const interval = setInterval(() => {
      setCurrentTime((prev) => prev + 1)
      if (progress > 0 && currentTime > 0) { // Evita división por cero
        const timePerPercent = currentTime / progress
        const remainingPercent = 100 - progress
        setEstimatedTime(Math.round(timePerPercent * remainingPercent))
      }
    }, 1000)

    return () => clearInterval(interval)
  }, [progress, currentTime])

  const formatFileSize = (bytes: number) => {
    if (bytes === 0) return "0.0 MB";
    const mb = bytes / (1024 * 1024)
    return `${mb.toFixed(1)} MB`
  }

  const formatTime = (seconds: number) => {
    const mins = Math.floor(seconds / 60)
    const secs = seconds % 60
    return `${mins}:${secs.toString().padStart(2, "0")}`
  }

  // [2] Mantenemos los 3 pasos principales en el array
  const steps = [
    {
      id: "transcribing",
      title: "Transcripción",
      description: "Convirtiendo audio a texto",
      icon: Headphones,
    },
    {
      id: "diarizing",
      title: "Identificación",
      description: "Separando hablantes",
      icon: Users,
    },
    {
      id: "generating",
      title: "Generación",
      description: "Estructurando acta",
      icon: FileText,
    },
  ]

  // [3] El índice se calcula igual, pero lo usaremos con más inteligencia
  const currentStepIndex = steps.findIndex((s) => s.id === step)

  return (
    <div className="space-y-4">
      <div className="text-center space-y-2">
        <div className="inline-flex items-center space-x-2 bg-slate-900 text-white px-3 py-1 rounded-full text-xs">
          <Zap className="w-3 h-3" />
          <span className="font-semibold">PROCESANDO</span>
        </div>
        <h2 className="text-xl font-light text-slate-900">Generando acta profesional</h2>
      </div>

      <Card className="p-4 bg-white border border-slate-200">
        <div className="space-y-4">
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <div className="text-xs font-medium text-slate-500 uppercase tracking-wide">Archivo</div>
              <div className="font-semibold text-slate-900 text-sm truncate">{fileName}</div>
              <div className="text-xs text-slate-500">{formatFileSize(fileSize)}</div>
            </div>
            <div className="text-right space-y-2">
              <div className="text-xs font-medium text-slate-500 uppercase tracking-wide">Progreso</div>
              <div className="text-2xl font-light text-slate-900">{progress}%</div>
              <div className="text-xs text-slate-500">
                {formatTime(currentTime)} / {estimatedTime > 0 ? `~${formatTime(estimatedTime)}` : "Finalizando"}
              </div>
            </div>
          </div>

          <Progress value={progress} className="h-2 bg-slate-100" />

          <div className="grid grid-cols-3 gap-2">
            {steps.map((stepInfo, index) => {
              // [4] Lógica de estado mejorada
              const isUploadingStep = step === 'uploading' && index === 0;
              const isActive = stepInfo.id === step || isUploadingStep;
              const isCompleted = currentStepIndex > index;
              
              // [5] Lógica de contenido dinámico para el primer paso
              const title = isUploadingStep ? "Subida" : stepInfo.title;
              const description = isUploadingStep ? "Enviando archivo" : stepInfo.description;
              const Icon = isUploadingStep ? UploadCloud : stepInfo.icon;

              return (
                <div
                  key={stepInfo.id}
                  className={`p-2 rounded-lg border text-center transition-all ${
                    isActive
                      ? "bg-slate-50 border-slate-300"
                      : isCompleted
                        ? "bg-slate-900 border-slate-900 text-white"
                        : "bg-white border-slate-200"
                  }`}
                >
                  <div className="flex flex-col items-center space-y-1">
                    <div className="w-6 h-6 flex items-center justify-center">
                      {isCompleted ? (
                        <div className="w-2 h-2 bg-white rounded-full"></div>
                      ) : isActive ? (
                        <Loader2 className="w-4 h-4 animate-spin" />
                      ) : (
                        <Icon className="w-4 h-4 text-slate-400" />
                      )}
                    </div>
                    <div className="text-xs font-medium">{title}</div>
                    <div className="text-xs opacity-75">{description}</div>
                  </div>
                </div>
              )
            })}
          </div>
        </div>
      </Card>
    </div>
  )
}