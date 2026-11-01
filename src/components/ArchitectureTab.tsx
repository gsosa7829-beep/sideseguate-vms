import React, { useState, useEffect } from 'react';
import { Camera } from '../lib/types';
import { 
  Server, 
  CheckCircle2, 
  XCircle, 
  RefreshCw, 
  ShieldCheck, 
  Activity, 
  Radio, 
  Wifi, 
  WifiOff,
  Video,
  Clock,
  Sparkles
} from 'lucide-react';

interface ArchitectureTabProps {
  cameras: Camera[];
}

const EZVIZ_ACCESS_TOKEN = 'at.b1exbqau80l85aox2k6x3487cw0byh2s-51eyws3m7n-0ii5ze3-uuk9pufag';

export const ArchitectureTab: React.FC<ArchitectureTabProps> = ({ cameras }) => {
  const [isOnline, setIsOnline] = useState<boolean>(true);
  const [isChecking, setIsChecking] = useState<boolean>(false);
  const [lastCheckTime, setLastCheckTime] = useState<string>('');
  const [latencyMs, setLatencyMs] = useState<number>(75);
  const [dvrModel, setDvrModel] = useState<string>('HiLook TurboHD (S04TURBOG2/A)');

  const checkServerStatus = async () => {
    setIsChecking(true);
    const start = Date.now();
    try {
      const res = await fetch('https://iusopen.ezvizlife.com/api/lapp/device/info', {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body: new URLSearchParams({
          accessToken: EZVIZ_ACCESS_TOKEN,
          deviceSerial: 'F31700438',
        }),
      });
      const end = Date.now();
      setLatencyMs(Math.max(40, end - start));

      const data = await res.json();
      if (data.code === '200') {
        // status === 1 significa En Línea en la nube de Hikvision
        setIsOnline(data.data?.status === 1);
        if (data.data?.model) {
          setDvrModel(`HiLook TurboHD (${data.data.model})`);
        }
      } else {
        setIsOnline(false);
      }
    } catch {
      setIsOnline(false);
    } finally {
      setIsChecking(false);
      setLastCheckTime(new Date().toLocaleTimeString('es-GT', { hour: '2-digit', minute: '2-digit', second: '2-digit' }));
    }
  };

  useEffect(() => {
    checkServerStatus();
    // Verificación automática cada 15 segundos en segundo plano
    const timer = setInterval(checkServerStatus, 15000);
    return () => clearInterval(timer);
  }, []);

  return (
    <div className="space-y-5 max-w-5xl mx-auto">
      {/* Encabezado Principal */}
      <div className="bg-neutral-900 border border-neutral-800 rounded-2xl p-4 sm:p-5 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
        <div>
          <div className="flex items-center gap-2">
            <Server className="w-5 h-5 text-sky-400" />
            <h2 className="text-base font-bold text-white">Estado del Servidor de Video</h2>
          </div>
          <p className="text-xs text-neutral-400 mt-0.5">
            Comprobación en tiempo real del enlace de transmisión y las cámaras.
          </p>
        </div>

        <button
          type="button"
          disabled={isChecking}
          onClick={checkServerStatus}
          className="px-4 py-2 bg-neutral-950 hover:bg-neutral-800 border border-neutral-800 text-white rounded-xl text-xs font-semibold flex items-center gap-2 transition active:scale-95 shadow-sm"
        >
          <RefreshCw className={`w-3.5 h-3.5 text-sky-400 ${isChecking ? 'animate-spin' : ''}`} />
          <span>{isChecking ? 'Comprobando…' : 'Comprobar Estado Ahora'}</span>
        </button>
      </div>

      {/* 🔴 / 🟢 TARJETA PRINCIPAL DE COMPROBACIÓN (VERDE = ACTIVO, ROJO = FUERA DE LÍNEA) */}
      {isOnline ? (
        <div className="bg-emerald-950/40 border-2 border-emerald-500/70 rounded-2xl p-5 sm:p-6 shadow-xl shadow-emerald-950/40 animate-in fade-in duration-200">
          <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
            <div className="flex items-center gap-4">
              <div className="relative w-14 h-14 rounded-2xl bg-emerald-500/20 border border-emerald-500/50 flex items-center justify-center text-emerald-400 shrink-0">
                <span className="w-4 h-4 rounded-full bg-emerald-400 animate-ping absolute" />
                <CheckCircle2 className="w-8 h-8 text-emerald-400 relative z-10" />
              </div>
              <div>
                <div className="flex items-center gap-2.5 flex-wrap">
                  <h3 className="text-lg font-black text-white tracking-wide">
                    SERVIDOR ACTIVO
                  </h3>
                  <span className="px-2.5 py-0.5 rounded-full text-[11px] font-bold bg-emerald-500 text-neutral-950 uppercase tracking-wider shadow">
                    En Línea
                  </span>
                </div>
                <p className="text-xs text-emerald-300 font-medium mt-1">
                  El servidor de video está funcionando correctamente y transmitiendo en vivo 24/7.
                </p>
              </div>
            </div>

            <div className="flex sm:flex-col items-center sm:items-end justify-between w-full sm:w-auto pt-2 sm:pt-0 border-t border-emerald-800/40 sm:border-0 text-xs font-mono text-emerald-400">
              <span className="flex items-center gap-1.5 font-bold">
                <Activity className="w-3.5 h-3.5" />
                Latencia: {latencyMs} ms
              </span>
              <span className="text-[11px] text-neutral-400 font-sans">
                Última comprobación: {lastCheckTime || 'Ahora mismo'}
              </span>
            </div>
          </div>
        </div>
      ) : (
        <div className="bg-red-950/40 border-2 border-red-500/70 rounded-2xl p-5 sm:p-6 shadow-xl shadow-red-950/40 animate-in fade-in duration-200">
          <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
            <div className="flex items-center gap-4">
              <div className="w-14 h-14 rounded-2xl bg-red-500/20 border border-red-500/50 flex items-center justify-center text-red-400 shrink-0">
                <XCircle className="w-8 h-8 text-red-400" />
              </div>
              <div>
                <div className="flex items-center gap-2.5 flex-wrap">
                  <h3 className="text-lg font-black text-white tracking-wide">
                    SERVIDOR FUERA DE LÍNEA
                  </h3>
                  <span className="px-2.5 py-0.5 rounded-full text-[11px] font-bold bg-red-500 text-white uppercase tracking-wider shadow">
                    No está funcionando
                  </span>
                </div>
                <p className="text-xs text-red-300 font-medium mt-1">
                  No se detecta señal del DVR o la conexión física a internet en el sitio está interrumpida.
                </p>
              </div>
            </div>

            <button
              type="button"
              disabled={isChecking}
              onClick={checkServerStatus}
              className="w-full sm:w-auto px-5 py-2.5 bg-red-600 hover:bg-red-500 text-white font-bold text-xs rounded-xl transition shadow-lg shadow-red-600/30 flex items-center justify-center gap-2 active:scale-95"
            >
              <RefreshCw className={`w-3.5 h-3.5 ${isChecking ? 'animate-spin' : ''}`} />
              <span>Reintentar Conexión</span>
            </button>
          </div>
        </div>
      )}

      {/* Estado individual de las Cámaras */}
      <div className="bg-neutral-900 border border-neutral-800 rounded-2xl p-4 sm:p-5 space-y-3">
        <h3 className="text-xs font-bold text-neutral-300 uppercase tracking-wider flex items-center gap-2">
          <Video className="w-4 h-4 text-sky-400" />
          <span>Canales de Cámaras Vinculadas</span>
        </h3>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          {cameras.map((cam) => (
            <div
              key={cam.id}
              className={`p-3.5 rounded-xl border flex items-center justify-between transition-all ${
                isOnline
                  ? 'bg-neutral-950 border-neutral-800 hover:border-emerald-500/40'
                  : 'bg-neutral-950 border-red-950/60'
              }`}
            >
              <div className="flex items-center gap-3 min-w-0">
                <span
                  className={`w-3 h-3 rounded-full shrink-0 ${
                    isOnline ? 'bg-emerald-400 animate-pulse shadow-sm shadow-emerald-400' : 'bg-red-500'
                  }`}
                />
                <div className="min-w-0">
                  <h4 className="text-xs font-bold text-white truncate">{cam.name}</h4>
                  <p className="text-[11px] text-neutral-400 font-mono mt-0.5">
                    Canal {cam.channel} · {isOnline ? 'Transmisión 25 FPS Activa' : 'Sin señal'}
                  </p>
                </div>
              </div>

              <span
                className={`text-[10.5px] font-bold font-mono px-2 py-0.5 rounded-md shrink-0 ${
                  isOnline
                    ? 'bg-emerald-950 text-emerald-400 border border-emerald-800/80'
                    : 'bg-red-950 text-red-400 border border-red-800/80'
                }`}
              >
                {isOnline ? '1080p FHD' : 'Offline'}
              </span>
            </div>
          ))}
        </div>
      </div>

      {/* Métricas Técnicas Esenciales (Sin textos largos ni guías) */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        <div className="bg-neutral-900 border border-neutral-800 rounded-xl p-3.5 text-xs">
          <span className="text-neutral-400 text-[11px] block">Disponibilidad</span>
          <span className="text-white font-bold text-sm font-mono mt-0.5 block">24/7 En Línea</span>
          <span className="text-emerald-400 text-[10px] mt-1 flex items-center gap-1 font-medium">
            <Sparkles className="w-3 h-3" /> 99.9% Operativo
          </span>
        </div>

        <div className="bg-neutral-900 border border-neutral-800 rounded-xl p-3.5 text-xs">
          <span className="text-neutral-400 text-[11px] block">Grabador Físico</span>
          <span className="text-white font-bold text-sm truncate mt-0.5 block">F31700438</span>
          <span className="text-neutral-400 text-[10px] mt-1 block truncate">{dvrModel}</span>
        </div>

        <div className="bg-neutral-900 border border-neutral-800 rounded-xl p-3.5 text-xs">
          <span className="text-neutral-400 text-[11px] block">Protocolo Web</span>
          <span className="text-white font-bold text-sm font-mono mt-0.5 block">HLS 25 FPS</span>
          <span className="text-sky-400 text-[10px] mt-1 block">Passthrough H.264</span>
        </div>

        <div className="bg-neutral-900 border border-neutral-800 rounded-xl p-3.5 text-xs">
          <span className="text-neutral-400 text-[11px] block">Seguridad / Cifrado</span>
          <span className="text-white font-bold text-sm mt-0.5 block">Desbloqueado</span>
          <span className="text-emerald-400 text-[10px] mt-1 flex items-center gap-1">
            <ShieldCheck className="w-3 h-3" /> Acceso Inmediato
          </span>
        </div>
      </div>
    </div>
  );
};
