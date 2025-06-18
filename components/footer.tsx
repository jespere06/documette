"use client"

import { Shield, Clock, FileText } from "lucide-react"

export function Footer() {
  return (
    <footer className="border-t border-slate-200/40 bg-white/40 backdrop-blur-sm mt-12">
      <div className="container mx-auto px-4 py-6 max-w-6xl">
        <div className="grid md:grid-cols-3 gap-6 text-center md:text-left">
          <div className="space-y-2">
            <div className="flex items-center justify-center md:justify-start space-x-2">
              <Shield className="w-4 h-4 text-blue-600" />
              <span className="font-semibold text-slate-900">Seguridad garantizada</span>
            </div>
            <p className="text-sm text-slate-600">Encriptación end-to-end y eliminación automática</p>
          </div>

          <div className="space-y-2">
            <div className="flex items-center justify-center md:justify-start space-x-2">
              <Clock className="w-4 h-4 text-emerald-600" />
              <span className="font-semibold text-slate-900">Procesamiento rápido</span>
            </div>
            <p className="text-sm text-slate-600">Resultados en minutos con tecnología de punta</p>
          </div>

          <div className="space-y-2">
            <div className="flex items-center justify-center md:justify-start space-x-2">
              <FileText className="w-4 h-4 text-purple-600" />
              <span className="font-semibold text-slate-900">Actas profesionales</span>
            </div>
            <p className="text-sm text-slate-600">Documentos listos para usar en tu empresa</p>
          </div>
        </div>

        <div className="flex flex-col md:flex-row items-center justify-between pt-6 mt-6 border-t border-slate-200">
          <p className="text-sm text-slate-500">© 2024 Documette. Todos los derechos reservados.</p>

          <div className="mt-3 md:mt-0">
            <span className="text-sm text-slate-400">Versión 2.1</span>
          </div>
        </div>
      </div>
    </footer>
  )
}
