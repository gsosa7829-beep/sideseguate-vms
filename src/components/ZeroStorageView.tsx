import React from 'react';
import { 
  CloudOff, 
  Check
} from 'lucide-react';

export const ZeroStorageView: React.FC = () => {
  return (
    <div className="space-y-4">
      {/* Header Banner */}
      <div className="bg-neutral-900/60 border border-neutral-850 p-4 rounded-xl flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
        <div>
          <div className="flex items-center gap-2 mb-1">
            <CloudOff className="w-4 h-4 text-emerald-400" />
            <h3 className="text-sm font-bold text-white tracking-tight">
              Arquitectura Cero Nube: Streaming en Vivo Bajo Demanda
            </h3>
          </div>
          <p className="text-xs text-neutral-400 max-w-2xl leading-relaxed">
            Configuración técnica que garantiza 0 MB de almacenamiento de video en disco duro externo. Las cámaras transmiten directamente cuando el cliente abre su enlace web.
          </p>
        </div>

        <div className="flex items-center gap-2 font-mono text-xs">
          <span className="px-2.5 py-1 rounded-lg bg-emerald-950/60 text-emerald-400 border border-emerald-800/80 font-bold">
            0 GB EN NUBE
          </span>
        </div>
      </div>

      {/* 3 Step On-Demand Lifecycle */}
      <div className="bg-neutral-900/70 border border-neutral-850 rounded-xl p-5 shadow-sm space-y-4">
        <h4 className="text-xs font-bold text-white uppercase tracking-wider font-mono">
          ¿Cómo funciona el Proxy en Vivo sin guardar video? (Ciclo de Vida)
        </h4>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-4 text-xs">
          {/* Step 1 */}
          <div className="bg-neutral-950/80 p-4 rounded-xl border border-neutral-850 flex flex-col justify-between">
            <div>
              <div className="text-[10px] font-mono font-bold text-neutral-500 mb-1">FASE 1 · REPOSO</div>
              <h5 className="font-semibold text-white mb-2">Ningún cliente conectado</h5>
              <p className="text-neutral-400 leading-relaxed text-[11px]">
                Gracias a la directiva <code className="text-sky-300 font-mono">sourceOnDemand: yes</code> en MediaMTX, el servidor no solicita el video a las cámaras Hikvision mientras nadie las mira.
              </p>
            </div>
            <div className="mt-3 pt-3 border-t border-neutral-850 font-mono text-[10px] text-emerald-400">
              Consumo: 0 kbps · Disco: 0 MB
            </div>
          </div>

          {/* Step 2 */}
          <div className="bg-neutral-950/80 p-4 rounded-xl border border-neutral-850 flex flex-col justify-between">
            <div>
              <div className="text-[10px] font-mono font-bold text-sky-400 mb-1">FASE 2 · ENLACE ABIERTO</div>
              <h5 className="font-semibold text-white mb-2">Cliente abre enlace web</h5>
              <p className="text-neutral-400 leading-relaxed text-[11px]">
                En ese instante MediaMTX abre la sesión RTSP (:554), convierte la señal a formato web (HLS) en la memoria RAM y se la muestra al cliente en su navegador.
              </p>
            </div>
            <div className="mt-3 pt-3 border-t border-neutral-850 font-mono text-[10px] text-sky-400">
              Video en vivo directo (RAM)
            </div>
          </div>

          {/* Step 3 */}
          <div className="bg-neutral-950/80 p-4 rounded-xl border border-neutral-850 flex flex-col justify-between">
            <div>
              <div className="text-[10px] font-mono font-bold text-emerald-400 mb-1">FASE 3 · CIERRE</div>
              <h5 className="font-semibold text-white mb-2">Cliente cierra la pestaña</h5>
              <p className="text-neutral-400 leading-relaxed text-[11px]">
                A los 10 segundos de inactividad, MediaMTX desconecta el flujo de la cámara automáticamente. No queda ningún archivo residual guardado.
              </p>
            </div>
            <div className="mt-3 pt-3 border-t border-neutral-850 font-mono text-[10px] text-emerald-400">
              Cierre automático · Limpieza total
            </div>
          </div>
        </div>
      </div>

      {/* Technical Comparison */}
      <div className="bg-neutral-900/70 border border-neutral-850 rounded-xl p-5 shadow-sm space-y-4">
        <h4 className="text-xs font-bold text-white uppercase tracking-wider font-mono">
          Ventajas de Privacidad y Rendimiento para tus Clientes
        </h4>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-4 text-xs">
          {/* Traditional Cloud Storage */}
          <div className="bg-neutral-950/80 p-4 rounded-xl border border-red-900/30 space-y-3">
            <div className="flex items-center justify-between">
              <span className="font-bold text-white">Apps Tradicionales con Nube Externa</span>
              <span className="text-red-400 font-mono font-bold">Lento & Invasivo</span>
            </div>
            <ul className="space-y-2 text-neutral-400 text-[11px]">
              <li className="flex items-start gap-2">
                <span className="text-red-400 font-bold">✕</span>
                <span>Obliga al comprador o cliente a descargar aplicaciones pesadas y crear cuentas.</span>
              </li>
              <li className="flex items-start gap-2">
                <span className="text-red-400 font-bold">✕</span>
                <span>Satura el internet de subida subiendo grabaciones continuas todo el día.</span>
              </li>
              <li className="flex items-start gap-2">
                <span className="text-red-400 font-bold">✕</span>
                <span>Comparte credenciales maestras del DVR en lugar de enlaces temporales seguros.</span>
              </li>
            </ul>
          </div>

          {/* SIDESEGUATE Windows On-Demand */}
          <div className="bg-neutral-950/80 p-4 rounded-xl border border-emerald-900/40 space-y-3">
            <div className="flex items-center justify-between">
              <span className="font-bold text-white">Pasarela Web Directa SIDESEGUATE</span>
              <span className="text-emerald-400 font-mono font-bold">100% En Vivo</span>
            </div>
            <ul className="space-y-2 text-neutral-300 text-[11px]">
              <li className="flex items-start gap-2">
                <Check className="w-3.5 h-3.5 text-emerald-400 shrink-0 mt-0.5" />
                <span><strong>Acceso inmediato por enlace:</strong> El cliente toca el link en WhatsApp y ve la cámara en Safari o Chrome.</span>
              </li>
              <li className="flex items-start gap-2">
                <Check className="w-3.5 h-3.5 text-emerald-400 shrink-0 mt-0.5" />
                <span><strong>Grabación segura en sitio:</strong> El respaldo histórico permanece privado en el disco duro del DVR Hikvision.</span>
              </li>
              <li className="flex items-start gap-2">
                <Check className="w-3.5 h-3.5 text-emerald-400 shrink-0 mt-0.5" />
                <span><strong>Control total del vendedor:</strong> Activa, pausa o pon fecha de vencimiento a cada enlace de demostración.</span>
              </li>
            </ul>
          </div>
        </div>
      </div>
    </div>
  );
};
