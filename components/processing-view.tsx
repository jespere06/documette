"use client"

import { useEffect, useState } from "react"
import { Progress } from "@/components/ui/progress"
import { Card } from "@/components/ui/card"
import { Loader2, Headphones, Users, FileText, Zap, Check } from "lucide-react" // Añadido Check
import type { JobStatus } from "@/app/page" // O desde donde importes JobStatus

interface ProcessingViewProps {
  step: JobStatus;
  progress: number
  fileName: string
  fileSize: number // Asegúrate de pasar un valor real desde AppContainer si quieres que se muestre
}

export function ProcessingView({ step, progress, fileName, fileSize }: ProcessingViewProps) {
  const [currentTime, setCurrentTime] = useState(0)
  // Ajuste inicial para el tiempo estimado, podría ser más dinámico
  const [estimatedTotalTime, setEstimatedTotalTime] = useState(120) // Estimación total en segundos

  useEffect(() => {
    const interval = setInterval(() => {
      setCurrentTime((prev) => prev + 1)
    }, 1000)
    return () => clearInterval(interval)
  }, [])

  const estimatedRemainingTime = () => {
    if (progress === 0 || progress === 100) return 0;
    // Una forma simple de estimar: si el 35% tomó X, el 100% tomará (X / 0.35)
    // Y el restante es (Total Estimado - Tiempo Actual)
    // Esto es muy básico, podrías querer una lógica más sofisticada si el tiempo por paso varía mucho.
    // O podrías basar estimatedTotalTime en la duración del audio inicialmente.
    const projectedTotal = (currentTime / progress) * 100;
    return Math.max(0, Math.round(projectedTotal - currentTime));
  }


  const formatFileSize = (bytes: number) => {
    if (bytes === 0) return "0.0 MB"; // Para evitar NaN si fileSize es 0
    const mb = bytes / (1024 * 1024)
    return `${mb.toFixed(1)} MB`
  }

  const formatTime = (seconds: number) => {
    const mins = Math.floor(seconds / 60)
    const secs = seconds % 60
    return `${mins}:${secs.toString().padStart(2, "0")}`
  }

  // Los IDs deben coincidir con los valores de JobStatus
  const stepsDefinition: Array<{ id: JobStatus, title: string, description: string, icon: React.ElementType }> = [
    {
      id: "transcribed", // Coincide con JobStatus
      title: "Transcripción",
      description: "Convirtiendo audio a texto",
      icon: Headphones,
    },
    {
      id: "diarized",    // Coincide con JobStatus
      title: "Identificación",
      description: "Separando hablantes",
      icon: Users,
    },
    {
      id: "generated",   // Coincide con JobStatus
      title: "Generación",
      description: "Estructurando acta",
      icon: FileText,
    },
  ];

  // Encuentra el índice del estado actual del job en nuestra definición de pasos.
  // Esto es para marcar los pasos anteriores como completados.
  const currentJobStatusIndex = stepsDefinition.findIndex((s) => s.id === step);

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
                {formatTime(currentTime)} / {progress < 100 && progress > 0 ? `~${formatTime(estimatedRemainingTime())}` : (progress === 100 ? "Completado" : "Calculando...")}
              </div>
            </div>
          </div>

          <Progress value={progress} className="h-2 bg-slate-100" />

          <div className="grid grid-cols-3 gap-2">
            {stepsDefinition.map((stepInfo, index) => {
              // Determinar si este paso es el actual, uno anterior (completado) o uno futuro.
              // El 'step' (JobStatus) que está "activo" según el backend.
              const isActiveStep = stepInfo.id === step;
              
              // Un paso se considera completado si su índice es menor que el índice del estado actual del job.
              // Ejemplo: si step='diarized' (índice 1), entonces 'transcribed' (índice 0) está completado.
              const isCompletedStep = currentJobStatusIndex > - 1 && index < currentJobStatusIndex;

              const Icon = stepInfo.icon;

              return (
                <div
                  key={stepInfo.id}
                  className={`p-2 rounded-lg border text-center transition-all ${
                    isActiveStep
                      ? "bg-slate-50 border-slate-300" // Estilo para el paso activo
                      : isCompletedStep
                        ? "bg-slate-900 border-slate-900 text-white" // Estilo para pasos completados
                        : "bg-white border-slate-200" // Estilo para pasos futuros/pendientes
                  }`}
                >
                  <div className="flex flex-col items-center space-y-1">
                    <div className="w-6 h-6 flex items-center justify-center">
                      {isCompletedStep ? (
                        <Check className="w-4 h-4 text-white" /> // Icono para completado
                      ) : isActiveStep ? (
                        <Loader2 className="w-4 h-4 animate-spin" /> // Icono para activo
                      ) : (
                        <Icon className="w-4 h-4 text-slate-400" /> // Icono para pendiente
                      )}
                    </div>
                    <div className="text-xs font-medium">{stepInfo.title}</div>
                    <div className="text-xs opacity-75">{stepInfo.description}</div>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      </Card>
    </div>
  );
}