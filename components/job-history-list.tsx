// components/job-history-list.tsx
"use client"

import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { ScrollArea } from "@/components/ui/scroll-area"
import { History, FileText, CheckCircle, AlertTriangle, Loader2, Eye } from "lucide-react"
import type { JobInstance } from "@/app/page"

interface JobHistoryListProps {
  jobInstances: JobInstance[];
  activeJobId: string | null;
  onSelectJob: (jobId: string) => void;
  isLoading: boolean;
}

// --- OBJETO CORREGIDO CON TEXTOS EN ESPAÑOL ---
const statusInfo: { [key: string]: { text: string; icon: React.ElementType; color: string } } = {
  complete: { text: "Completado", icon: CheckCircle, color: "bg-green-500" },
  error: { text: "Error", icon: AlertTriangle, color: "bg-red-500" },
  uploading: { text: "Subiendo...", icon: Loader2, color: "bg-blue-500 animate-spin" },
  uploaded: { text: "Transcribiendo...", icon: Loader2, color: "bg-blue-500 animate-spin" },
  transcribed: { text: "Diarizando...", icon: Loader2, color: "bg-blue-500 animate-spin" }, // 'transcribed' ahora es 'Diarizando'
  diarized: { text: "Generando acta...", icon: Loader2, color: "bg-blue-500 animate-spin" },
  generated: { text: "Creando DOCX...", icon: Loader2, color: "bg-blue-500 animate-spin" },
};
// --- FIN DE LA CORRECCIÓN ---

export function JobHistoryList({ jobInstances, activeJobId, onSelectJob, isLoading }: JobHistoryListProps) {
  if (isLoading) {
    return <div className="text-center text-slate-500 mt-8">Cargando historial...</div>
  }

  if (jobInstances.length === 0) {
    return <div className="text-center text-slate-500 mt-8">No hay grabaciones en tu historial.</div>
  }

  return (
    <Card className="mt-8 border-slate-200">
      <CardHeader>
        <div className="flex items-center space-x-2">
          <History className="w-5 h-5 text-slate-500" />
          <CardTitle className="text-lg">Historial de Grabaciones</CardTitle>
        </div>
      </CardHeader>
      <CardContent>
        <ScrollArea className="h-64">
          <div className="space-y-3">
            {jobInstances.map((job) => {
              const info = statusInfo[job.status] || { text: job.status, icon: FileText, color: "bg-slate-400" };
              const Icon = info.icon;
              const isActive = job.id === activeJobId;

              return (
                <div 
                  key={job.id} 
                  className={`flex items-center justify-between p-3 rounded-lg border transition-all ${isActive ? 'bg-slate-100 border-slate-300' : 'bg-white border-slate-200 hover:bg-slate-50 cursor-pointer'}`}
                  onClick={() => !isActive && onSelectJob(job.id)}
                >
                  <div className="flex items-center space-x-3">
                    <div className={`w-2 h-2 rounded-full ${info.color}`}></div>
                    <div>
                      <p className="font-semibold text-sm text-slate-900">{job.title}</p>
                      <p className="text-xs text-slate-600">
                        {new Date(job.created_at).toLocaleDateString("es-ES", { day: "numeric", month: "long", year: "numeric" })}
                      </p>
                    </div>
                  </div>
                  <div className="flex items-center space-x-2">
                    <Badge variant="outline" className="text-xs capitalize">{info.text}</Badge>
                    <Button 
                      size="sm" 
                      variant="outline" 
                      onClick={(e) => { e.stopPropagation(); onSelectJob(job.id); }}
                      disabled={isActive}
                      className="border-slate-300"
                    >
                      <Eye className="w-3 h-3 mr-1" />
                      Ver
                    </Button>
                  </div>
                </div>
              )
            })}
          </div>
        </ScrollArea>
      </CardContent>
    </Card>
  )
}