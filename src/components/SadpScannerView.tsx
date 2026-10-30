import React, { useState } from 'react';
import {
  SearchCode,
  AlertTriangle,
  ShieldCheck,
  RefreshCw,
  Check,
  Copy,
  Gauge,
  CheckSquare,
  Square,
} from 'lucide-react';
import { calculateBandwidthMetrics } from '../lib/qrGenerator';

export const SadpScannerView: React.FC = () => {
  const [isScanning, setIsScanning] = useState(false);
  const [copiedKey, setCopiedKey] = useState<string | null>(null);

  // Interactive Bandwidth Calculator State
  const [simCameras, setSimCameras] = useState<number>(4);
  const [simViewers, setSimViewers] = useState<number>(5);
  const [simStreamType, setSimStreamType] = useState<'main' | 'sub'>('sub');

  // Interactive Field Technician Checklist State
  const [checklist, setChecklist] = useState<Record<string, boolean>>({
    dhcpFixed: true,
    helgdmDisabled: true,
    h264Codec: true,
    rtspPort554: true,
  });

  const handleCopy = (text: string, key: string) => {
    navigator.clipboard.writeText(text);
    setCopiedKey(key);
    setTimeout(() => setCopiedKey(null), 2000);
  };

  const handleRescan = () => {
    setIsScanning(true);
    setTimeout(() => {
      setIsScanning(false);
    }, 800);
  };

  const toggleCheck = (key: string) => {
    setChecklist((prev) => ({ ...prev, [key]: !prev[key] }));
  };

  const bwReport = calculateBandwidthMetrics(simCameras, simViewers, simStreamType);
  const completedSteps = Object.values(checklist).filter(Boolean).length;

  return (
    <div className="space-y-5">
      {/* Header Banner */}
      <div className="bg-neutral-900/60 border border-neutral-850 p-4 rounded-xl flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
        <div>
          <div className="flex items-center gap-2 mb-1">
            <SearchCode className="w-4 h-4 text-emerald-400" />
            <h3 className="text-sm font-bold text-white tracking-tight">
              Escáner SADP Tool & Diagnóstico de Red Local Hikvision
            </h3>
          </div>
          <p className="text-xs text-neutral-400 max-w-2xl leading-relaxed">
            Diagnóstico de los equipos detectados en la red local del cliente y calculadora de ancho de banda para enlaces compartidos por WhatsApp.
          </p>
        </div>

        <button
          onClick={handleRescan}
          disabled={isScanning}
          className="px-3.5 py-2 bg-neutral-800 hover:bg-neutral-750 text-white rounded-lg text-xs font-medium flex items-center gap-2 transition border border-neutral-700/80 shadow-sm whitespace-nowrap shrink-0"
        >
          <RefreshCw className={`w-3.5 h-3.5 text-emerald-400 ${isScanning ? 'animate-spin' : ''}`} />
          <span>{isScanning ? 'Escaneando LAN...' : 'Volver a Escanear'}</span>
        </button>
      </div>

      {/* Primary SADP Inspection Card */}
      <div className="bg-neutral-900/70 border border-neutral-850 rounded-xl p-5 space-y-4 shadow-sm">
        <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 border-b border-neutral-800 pb-3">
          <div>
            <div className="font-bold text-white text-sm flex items-center gap-2">
              <span>Hikvision iDS-7108HQHI-M1/S0 (8 Canales AcuSense)</span>
              <span className="text-xs font-mono text-emerald-400 font-semibold">
                · En Línea
              </span>
            </div>
            <p className="text-xs text-neutral-400 font-mono tabular-nums mt-0.5">
              Número de Serie: L18365299 · MAC: e0:ba:ad:cd:bc:05
            </p>
          </div>

          <div className="flex items-center gap-2">
            <button
              onClick={() =>
                handleCopy(
                  'rtsp://usuario:contraseña@192.168.1.41:554/Streaming/Channels/101',
                  'sadp_rtsp'
                )
              }
              className="px-2.5 py-1.5 bg-neutral-800 hover:bg-neutral-750 text-neutral-200 rounded-lg text-xs font-mono flex items-center gap-1.5 border border-neutral-700/80 transition whitespace-nowrap"
            >
              {copiedKey === 'sadp_rtsp' ? (
                <Check className="w-3.5 h-3.5 text-emerald-400" />
              ) : (
                <Copy className="w-3.5 h-3.5 text-neutral-400" />
              )}
              <span>{copiedKey === 'sadp_rtsp' ? 'Copiado' : 'Copiar RTSP :554'}</span>
            </button>
          </div>
        </div>

        {/* Network Parameters Grid */}
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 text-xs font-mono tabular-nums">
          <div className="bg-neutral-950/80 p-3 rounded-lg border border-neutral-850">
            <span className="text-[10px] text-neutral-500 block">IP LOCAL (IPv4)</span>
            <span className="text-emerald-400 font-bold text-sm">192.168.1.41</span>
          </div>

          <div className="bg-neutral-950/80 p-3 rounded-lg border border-neutral-850">
            <span className="text-[10px] text-neutral-500 block">PUERTA DE ENLACE (ROUTER)</span>
            <span className="text-white font-bold text-sm">192.168.1.1</span>
          </div>

          <div className="bg-neutral-950/80 p-3 rounded-lg border border-neutral-850">
            <span className="text-[10px] text-neutral-500 block">PUERTO RTSP STREAM</span>
            <span className="text-sky-400 font-bold text-sm">TCP 554</span>
          </div>

          <div className="bg-neutral-950/80 p-3 rounded-lg border border-neutral-850">
            <span className="text-[10px] text-neutral-500 block">PUERTO SDK HIKVISION</span>
            <span className="text-purple-400 font-bold text-sm">TCP 8000</span>
          </div>
        </div>

        {/* Technical Guidance & Warnings */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-3 text-xs pt-1">
          <div className="bg-amber-950/20 border border-amber-800/40 p-3.5 rounded-lg text-amber-200 leading-relaxed space-y-1">
            <div className="flex items-center gap-1.5 font-bold text-amber-300">
              <AlertTriangle className="w-4 h-4 text-amber-400 shrink-0" />
              <span>Ajuste Requerido en SADP: Desmarcar DHCP</span>
            </div>
            <p className="text-[11px] text-amber-200/90">
              En la captura de SADP la casilla <strong>Enable DHCP</strong> está marcada. El técnico debe <strong>desmarcarla</strong> en el software SADP y guardar para que la IP <code className="font-mono">192.168.1.41</code> quede fija y no cambie al reiniciar el router.
            </p>
          </div>

          <div className="bg-sky-950/20 border border-sky-800/40 p-3.5 rounded-lg text-sky-200 leading-relaxed space-y-1">
            <div className="flex items-center gap-1.5 font-bold text-sky-300">
              <ShieldCheck className="w-4 h-4 text-sky-400 shrink-0" />
              <span>Código de Verificación: ••••••</span>
            </div>
            <p className="text-[11px] text-sky-200/90">
              En los DVRs AcuSense viene activo el <em>Cifrado de Flujo</em>. En el menú del DVR (Red &gt; Ajustes Avanzados &gt; Acceso a Plataforma), desmarcar <strong>Cifrado de Flujo</strong> ingresando el código de verificación del equipo para permitir el remuxing web directo.
            </p>
          </div>
        </div>
      </div>

      {/* Interactive Bandwidth Calculator & Technician Checklist */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        {/* Bandwidth Calculator */}
        <div className="bg-neutral-900/70 border border-neutral-850 rounded-xl p-5 space-y-4">
          <div className="flex items-center justify-between border-b border-neutral-800 pb-3">
            <div className="flex items-center gap-2">
              <Gauge className="w-4 h-4 text-sky-400" />
              <h4 className="text-sm font-bold text-white">
                Calculadora de Ancho de Banda (Subida DVR)
              </h4>
            </div>
            <span className="text-xs font-mono tabular-nums text-emerald-400 font-semibold">
              Ahorro: {bwReport.bandwidthSavedPercent}%
            </span>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 text-xs">
            <div>
              <label htmlFor="sim-cams" className="block text-neutral-400 mb-1">
                Cámaras activas: <strong className="text-white font-mono tabular-nums">{simCameras}</strong>
              </label>
              <input
                id="sim-cams"
                type="range"
                min={1}
                max={16}
                value={simCameras}
                onChange={(e) => setSimCameras(Number(e.target.value))}
                className="w-full accent-sky-500 cursor-pointer"
              />
            </div>

            <div>
              <label htmlFor="sim-viewers" className="block text-neutral-400 mb-1">
                Clientes simultáneos: <strong className="text-white font-mono tabular-nums">{simViewers}</strong>
              </label>
              <input
                id="sim-viewers"
                type="range"
                min={1}
                max={20}
                value={simViewers}
                onChange={(e) => setSimViewers(Number(e.target.value))}
                className="w-full accent-sky-500 cursor-pointer"
              />
            </div>

            <div>
              <span className="block text-neutral-400 mb-1">Calidad de Canal:</span>
              <div className="flex items-center gap-1 bg-neutral-950 p-1 rounded-lg border border-neutral-800">
                <button
                  type="button"
                  onClick={() => setSimStreamType('sub')}
                  className={`flex-1 py-1 px-2 rounded text-[11px] font-medium transition whitespace-nowrap ${
                    simStreamType === 'sub'
                      ? 'bg-neutral-800 text-white'
                      : 'text-neutral-400 hover:text-white'
                  }`}
                >
                  Sub (X02)
                </button>
                <button
                  type="button"
                  onClick={() => setSimStreamType('main')}
                  className={`flex-1 py-1 px-2 rounded text-[11px] font-medium transition whitespace-nowrap ${
                    simStreamType === 'main'
                      ? 'bg-neutral-800 text-white'
                      : 'text-neutral-400 hover:text-white'
                  }`}
                >
                  Main (X01)
                </button>
              </div>
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3 text-xs font-mono tabular-nums">
            <div className="bg-neutral-950 p-3 rounded-lg border border-neutral-850">
              <span className="text-[10px] text-neutral-400 block">
                CON GATEWAY SIDESEGUATE
              </span>
              <span className="text-base font-bold text-emerald-400">
                {(bwReport.dvrUploadWithGatewayKbps / 1024).toFixed(1)} Mbps
              </span>
              <span className="text-[10px] text-neutral-500 block mt-0.5">
                ({bwReport.dvrUploadWithGatewayKbps} kbps desde el DVR)
              </span>
            </div>

            <div className="bg-neutral-950 p-3 rounded-lg border border-neutral-850">
              <span className="text-[10px] text-neutral-400 block">
                SIN GATEWAY (DIRECTO)
              </span>
              <span className="text-base font-bold text-neutral-300">
                {(bwReport.dvrUploadWithoutGatewayKbps / 1024).toFixed(1)} Mbps
              </span>
              <span className="text-[10px] text-neutral-500 block mt-0.5">
                ({bwReport.dvrUploadWithoutGatewayKbps} kbps saturando DVR)
              </span>
            </div>
          </div>

          <p className="text-xs text-neutral-300 bg-neutral-950/70 border border-neutral-850 p-3 rounded-lg leading-relaxed">
            {bwReport.recommendation}
          </p>
        </div>

        {/* Field Technician Verification Checklist */}
        <div className="bg-neutral-900/70 border border-neutral-850 rounded-xl p-5 space-y-4">
          <div className="flex items-center justify-between border-b border-neutral-800 pb-3">
            <h4 className="text-sm font-bold text-white">
              Lista de Verificación Técnica en Campo (DVR)
            </h4>
            <span className="text-xs font-mono tabular-nums text-neutral-300">
              {completedSteps}/4 Completados
            </span>
          </div>

          <div className="space-y-2 text-xs">
            {[
              {
                key: 'dhcpFixed',
                title: 'IP Estática Fija (192.168.1.41)',
                desc: 'Desmarcar casilla Enable DHCP en Hikvision SADP Tool.',
              },
              {
                key: 'helgdmDisabled',
                title: 'Desactivar Cifrado de Flujo',
                desc: 'En Red > Acceso a Plataforma, desactivar Stream Encryption.',
              },
              {
                key: 'h264Codec',
                title: 'Códec de Video H.264 en Sub-Stream',
                desc: 'Garantiza reproducción inmediata en navegadores iPhone y Android.',
              },
              {
                key: 'rtspPort554',
                title: 'Puerto RTSP 554 Respondiendo en LAN',
                desc: 'Verificado en canales 101 al 402.',
              },
            ].map((item) => {
              const checked = !!checklist[item.key];
              return (
                <button
                  key={item.key}
                  type="button"
                  onClick={() => toggleCheck(item.key)}
                  className="w-full text-left p-2.5 rounded-lg bg-neutral-950 border border-neutral-850 hover:border-neutral-750 flex items-start gap-2.5 transition"
                >
                  {checked ? (
                    <CheckSquare className="w-4 h-4 text-emerald-400 shrink-0 mt-0.5" />
                  ) : (
                    <Square className="w-4 h-4 text-neutral-500 shrink-0 mt-0.5" />
                  )}
                  <div>
                    <div className={`font-semibold ${checked ? 'text-white' : 'text-neutral-400'}`}>
                      {item.title}
                    </div>
                    <div className="text-[11px] text-neutral-400">{item.desc}</div>
                  </div>
                </button>
              );
            })}
          </div>
        </div>
      </div>

      {/* 5-Device SADP Table & iVMS-4200 Cloud P2P Diagnostic */}
      <div className="bg-neutral-900/70 border border-neutral-850 rounded-xl p-5 space-y-4">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 border-b border-neutral-800 pb-3">
          <div>
            <h4 className="text-sm font-bold text-white">
              Inventario de los Equipos Detectados en SADP Tool & Cuenta iVMS-4200
            </h4>
            <p className="text-xs text-neutral-400">
              Equipos identificados en las capturas de red local del cliente (SADP Tool + Hik-Connect P2P).
            </p>
          </div>
          <span className="text-xs font-mono text-sky-400">
            5 Dispositivos en LAN (Subred 255.255.255.0)
          </span>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-left border-collapse text-xs">
            <thead>
              <tr className="border-b border-neutral-800 text-[11px] font-mono text-neutral-400 uppercase">
                <th className="py-2 pr-3">#</th>
                <th className="py-2 px-3">Equipo / Modelo</th>
                <th className="py-2 px-3">MAC / Serie</th>
                <th className="py-2 px-3">Canales (Encoding)</th>
                <th className="py-2 px-3">IP / Cuenta</th>
                <th className="py-2 pl-3">Estado Diagnóstico</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-neutral-800/70 font-mono text-[11px]">
              <tr>
                <td className="py-2.5 pr-3 text-neutral-400">01</td>
                <td className="py-2.5 px-3 font-sans font-semibold text-white">
                  Hikvision iDS-7108HQHI-M1/S0
                </td>
                <td className="py-2.5 px-3 text-neutral-300">
                  e0-ba-ad-cd-bc-05 · SN: L18365299
                </td>
                <td className="py-2.5 px-3 text-sky-400 font-bold">8 Canales</td>
                <td className="py-2.5 px-3 text-emerald-400 font-bold">192.168.1.41:8000</td>
                <td className="py-2.5 pl-3 text-amber-300 font-sans">
                  Fijar IP (Desmarcar Enable DHCP)
                </td>
              </tr>
              <tr>
                <td className="py-2.5 pr-3 text-neutral-400">02</td>
                <td className="py-2.5 px-3 font-sans font-semibold text-white">
                  EQUIPO DE PRUEBA (iDS-7204HUHI-M1/S)
                </td>
                <td className="py-2.5 px-3 text-neutral-300">
                  3c-1b-... · SN: FB2200254
                </td>
                <td className="py-2.5 px-3 text-sky-400 font-bold">4 Canales</td>
                <td className="py-2.5 px-3 text-emerald-400">Cuenta P2P: ••••••</td>
                <td className="py-2.5 pl-3 text-amber-300 font-sans">
                  En Línea (Error 1602: Conectar cámara física 12V en CH1-CH4)
                </td>
              </tr>
              <tr>
                <td className="py-2.5 pr-3 text-neutral-400">03</td>
                <td className="py-2.5 px-3 font-sans font-semibold text-white">
                  Cámara IP Hikvision PoE #1
                </td>
                <td className="py-2.5 px-3 text-neutral-300">a4-d5-c2-0...</td>
                <td className="py-2.5 px-3 text-sky-400 font-bold">1 Canal</td>
                <td className="py-2.5 px-3 text-neutral-300">LAN Local (SADP)</td>
                <td className="py-2.5 pl-3 text-emerald-400 font-sans">
                  Detectada en SADP · Lista para RTSP /101
                </td>
              </tr>
              <tr>
                <td className="py-2.5 pr-3 text-neutral-400">04</td>
                <td className="py-2.5 px-3 font-sans font-semibold text-white">
                  Cámara IP Hikvision PoE #2
                </td>
                <td className="py-2.5 px-3 text-neutral-300">04-03-12-2...</td>
                <td className="py-2.5 px-3 text-sky-400 font-bold">1 Canal</td>
                <td className="py-2.5 px-3 text-neutral-300">LAN Local (SADP)</td>
                <td className="py-2.5 pl-3 text-emerald-400 font-sans">
                  Detectada en SADP · Lista para RTSP /101
                </td>
              </tr>
              <tr>
                <td className="py-2.5 pr-3 text-neutral-400">05</td>
                <td className="py-2.5 px-3 font-sans font-semibold text-white">
                  DVR Hikvision DS-7108HGHI-F1/N
                </td>
                <td className="py-2.5 px-3 text-neutral-300">SN: F30392314 (12/2020)</td>
                <td className="py-2.5 px-3 text-sky-400 font-bold">8 Canales</td>
                <td className="py-2.5 px-3 text-neutral-300">LAN Local</td>
                <td className="py-2.5 pl-3 text-emerald-400 font-sans">
                  Compatible 100% con Pasarela RTSP
                </td>
              </tr>
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
};
