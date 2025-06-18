"use client"

import { useEffect, useState } from "react"
import { Progress } from "@/components/ui/progress"
import { Card } from "@/components/ui/card"
import { Loader2, Headphones, Users, FileText, Zap } from "lucide-react"
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
      if (progress > 0) {
        const timePerPercent = currentTime / progress
        const remainingPercent = 100 - progress
        setEstimatedTime(Math.max(0, Math.round(timePerPercent * remainingPercent)))
      }
    }, 1000)

    return () => clearInterval(interval)
  }, [progress, currentTime])

  const formatFileSize = (bytes: number) => {
    const mb = bytes / (1024 * 1024)
    return `${mb.toFixed(1)} MB`
  }

  const formatTime = (seconds: number) => {
    const mins = Math.floor(seconds / 60)
    const secs = seconds % 60
    return `${mins}:${secs.toString().padStart(2, "0")}`
  }

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

  const currentStepIndex = steps.findIndex((s) => s.id === step)

  return (
    <div className="space-y-4">
      {/* Header ultra compacto */}
      <div className="text-center space-y-2">
        <div className="inline-flex items-center space-x-2 bg-slate-900 text-white px-3 py-1 rounded-full text-xs">
          <Zap className="w-3 h-3" />
          <span className="font-semibold">PROCESANDO</span>
        </div>
        <h2 className="text-xl font-light text-slate-900">Generando acta profesional</h2>
      </div>

      {/* Todo en una sola card compacta */}
      <Card className="p-4 bg-white border border-slate-200">
        <div className="space-y-4">
          {/* Info del archivo + progreso en una fila */}
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

          {/* Barra de progreso */}
          <Progress value={progress} className="h-2 bg-slate-100" />

          {/* Steps horizontales compactos */}
          <div className="grid grid-cols-3 gap-2">
            {steps.map((stepInfo, index) => {
              const isActive = stepInfo.id === step
              const isCompleted = index < currentStepIndex
              const Icon = stepInfo.icon

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
                    <div className="text-xs font-medium">{stepInfo.title}</div>
                    <div className="text-xs opacity-75">{stepInfo.description}</div>
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
