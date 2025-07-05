"use client"

import { useEffect, useState } from "react"
import { Progress } from "@/components/ui/progress"
import { Card } from "@/components/ui/card"
import { Loader2, Headphones, Users, FileText, Zap, Check, Download } from "lucide-react"
import type { JobStatus } from "@/app/page"

interface ProcessingViewProps {
  step: JobStatus;
  progress: number
  fileName: string
  fileSize: number
}

export function ProcessingView({ step, progress, fileName, fileSize }: ProcessingViewProps) {
  const [currentTime, setCurrentTime] = useState(0)
  const [estimatedTotalTime, setEstimatedTotalTime] = useState(120)

  useEffect(() => {
    const interval = setInterval(() => {
      setCurrentTime((prev) => prev + 1)
    }, 1000)
    return () => clearInterval(interval)
  }, [])

  const estimatedRemainingTime = () => {
    if (progress === 0 || progress === 100) return 0;
    const projectedTotal = (currentTime / progress) * 100;
    return Math.max(0, Math.round(projectedTotal - currentTime));
  }

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

  // Agregamos todos los estados posibles incluyendo "fetching"
  const stepsDefinition: Array<{ id: JobStatus, title: string, description: string, icon: React.ElementType }> = [
    {
      id: "uploading",
      title: "Subiendo",
      description: "Cargando archivo",
      icon: Download,
    },
    {
      id: "uploaded",
      title: "Subido",
      description: "Archivo cargado",
      icon: Check,
    },
    {
      id: "transcribed",
      title: "Transcripción",
      description: "Convirtiendo audio a texto",
      icon: Headphones,
    },
    {
      id: "diarized",
      title: "Identificación",
      description: "Separando hablantes",
      icon: Users,
    },
    {
      id: "generated",
      title: "Generación",
      description: "Estructurando acta",
      icon: FileText,
    },
    {
      id: "fetching",
      title: "Finalizando",
      description: "Preparando resultado",
      icon: Zap,
    },
  ];

  const currentJobStatusIndex = stepsDefinition.findIndex((s) => s.id === step);

  // Determinar qué pasos mostrar según el estado actual
  const getVisibleSteps = () => {
    // Si estamos en estados iniciales (uploading, uploaded), mostrar solo los pasos principales
    if (step === "uploading" || step === "uploaded") {
      return stepsDefinition.slice(2, 5); // transcribed, diarized, generated
    }
    
    // Si estamos en fetching, mostrar los pasos principales
    if (step === "fetching") {
      return stepsDefinition.slice(2, 5); // transcribed, diarized, generated
    }
    
    // Para los demás estados, mostrar los pasos principales
    return stepsDefinition.slice(2, 5); // transcribed, diarized, generated
  };

  const visibleSteps = getVisibleSteps();

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
            {visibleSteps.map((stepInfo, index) => {
              // Lógica especial para diferentes estados
              let isActiveStep = false;
              let isCompletedStep = false;

              if (step === "uploading" || step === "uploaded") {
                // En estados iniciales, ningún paso principal está activo/completado
                isActiveStep = false;
                isCompletedStep = false;
              } else if (step === "fetching") {
                // En fetching, todos los pasos principales están completados
                isCompletedStep = true;
                isActiveStep = false;
              } else {
                // Para transcribed, diarized, generated
                isActiveStep = stepInfo.id === step;
                const stepIndex = stepsDefinition.findIndex(s => s.id === stepInfo.id);
                isCompletedStep = currentJobStatusIndex > -1 && stepIndex < currentJobStatusIndex;
              }

              const Icon = stepInfo.icon;

              return (
                <div
                  key={stepInfo.id}
                  className={`p-2 rounded-lg border text-center transition-all ${
                    isActiveStep
                      ? "bg-slate-50 border-slate-300"
                      : isCompletedStep
                        ? "bg-slate-900 border-slate-900 text-white"
                        : "bg-white border-slate-200"
                  }`}
                >
                  <div className="flex flex-col items-center space-y-1">
                    <div className="w-6 h-6 flex items-center justify-center">
                      {isCompletedStep ? (
                        <Check className="w-4 h-4 text-white" />
                      ) : isActiveStep ? (
                        <Loader2 className="w-4 h-4 animate-spin" />
                      ) : (
                        <Icon className="w-4 h-4 text-slate-400" />
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