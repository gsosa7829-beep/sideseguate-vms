import React, { useState } from 'react';
import { Camera } from '../lib/types';
import { generateMediaMtxYaml } from '../lib/mediaMtxGenerator';
import { 
  Server, 
  Workflow, 
  CheckCircle2, 
  AlertTriangle, 
  Copy, 
  Check, 
  ShieldCheck, 
  FileCode,
  Calendar,
  Activity,
  Monitor,
  Download,
  Play,
  CloudOff,
  ExternalLink,
  Laptop,
  CheckCircle,
  HelpCircle,
  Globe,
  Lock,
  Share2,
  Smartphone
} from 'lucide-react';

interface ArchitectureTabProps {
  cameras: Camera[];
}

export const ArchitectureTab: React.FC<ArchitectureTabProps> = ({ cameras }) => {
  const [activeTab, setActiveTab] = useState<'windows_guide' | 'domain_guide' | 'architecture' | 'mediamtx_yml'>('windows_guide');
  const [copiedKey, setCopiedKey] = useState<string | null>(null);

  const mediamtxYaml = generateMediaMtxYaml(cameras);

  const handleCopy = (text: string, key: string) => {
    navigator.clipboard.writeText(text);
    setCopiedKey(key);
    setTimeout(() => setCopiedKey(null), 2000);
  };

  return (
    <div className="space-y-6">
      {/* Top Banner */}
      <div className="bg-neutral-900/60 border border-neutral-800/80 rounded-xl p-4 flex flex-col md:flex-row items-start md:items-center justify-between gap-4">
        <div>
          <div className="flex items-center gap-2 mb-0.5 text-xs">
            <span className="font-semibold text-white">SIDESEGUATE</span>
            <span className="text-neutral-600">·</span>
            <span className="text-neutral-400">Pasarela de Video para Clientes</span>
          </div>
          <h2 className="text-base font-bold text-white tracking-tight">
            Arquitectura de Streaming & Servidor Windows
          </h2>
          <p className="text-xs text-neutral-400 max-w-2xl mt-0.5 leading-relaxed">
            Streaming directo desde tus cámaras Hikvision al navegador del comprador o cliente mediante enlaces web privados. Sin apps ni almacenamiento en nube.
          </p>
        </div>

        <div className="flex items-center gap-3 bg-neutral-950/80 border border-neutral-850 rounded-lg p-2.5 shrink-0 text-xs">
          <div className="text-center px-2">
            <div className="text-[10px] text-neutral-500 font-mono">PROTOCOLO</div>
            <div className="text-sm font-bold text-emerald-400 font-mono">RTSP → HLS</div>
          </div>
          <div className="h-6 w-px bg-neutral-800"></div>
          <div className="text-center px-2">
            <div className="text-[10px] text-neutral-500 font-mono">ACCESO CLIENTE</div>
            <div className="text-sm font-semibold text-neutral-200">Sin Apps</div>
          </div>
        </div>
      </div>

      {/* Minimalist Navigation Sub-Tabs */}
      <div className="flex flex-wrap gap-1.5 p-1 bg-neutral-950/70 border border-neutral-800/80 rounded-xl text-xs">
        <button
          onClick={() => setActiveTab('windows_guide')}
          className={`px-3 py-1.5 rounded-lg text-xs font-medium transition flex items-center gap-2 ${
            activeTab === 'windows_guide'
              ? 'bg-neutral-800 text-white shadow-sm border border-neutral-700/60'
              : 'text-neutral-400 hover:text-white hover:bg-neutral-900'
          }`}
        >
          <Server className="w-3.5 h-3.5 text-neutral-300" />
          <span>Guía Windows (Sin Linux)</span>
        </button>

        <button
          onClick={() => setActiveTab('domain_guide')}
          className={`px-3 py-1.5 rounded-lg text-xs font-medium transition flex items-center gap-2 ${
            activeTab === 'domain_guide'
              ? 'bg-neutral-800 text-white shadow-sm border border-neutral-700/60'
              : 'text-neutral-400 hover:text-white hover:bg-neutral-900'
          }`}
        >
          <Globe className="w-3.5 h-3.5 text-sky-400" />
          <span>¿Necesita Dominio? (Guía de URLs)</span>
        </button>

        <button
          onClick={() => setActiveTab('architecture')}
          className={`px-3 py-1.5 rounded-lg text-xs font-medium transition flex items-center gap-2 ${
            activeTab === 'architecture'
              ? 'bg-neutral-800 text-white shadow-sm border border-neutral-700/60'
              : 'text-neutral-400 hover:text-white hover:bg-neutral-900'
          }`}
        >
          <Workflow className="w-3.5 h-3.5" />
          <span>Flujo & Diagnóstico SADP</span>
        </button>

        <button
          onClick={() => setActiveTab('mediamtx_yml')}
          className={`px-3 py-1.5 rounded-lg text-xs font-medium transition flex items-center gap-2 ${
            activeTab === 'mediamtx_yml'
              ? 'bg-neutral-800 text-white shadow-sm border border-neutral-700/60'
              : 'text-neutral-400 hover:text-white hover:bg-neutral-900'
          }`}
        >
          <FileCode className="w-3.5 h-3.5" />
          <span>Configuración mediamtx.yml</span>
        </button>
      </div>

      {/* Tab 0: Windows Simple Server Guide (No Linux) */}
      {activeTab === 'windows_guide' && (
        <div className="space-y-4">
          {/* Minimalist Hero */}
          <div className="bg-neutral-900/60 border border-neutral-800/80 rounded-xl p-5 shadow-sm">
            <div className="flex items-center gap-2 text-xs text-neutral-400 mb-1">
              <span className="font-semibold text-white">Guía de Operación</span>
              <span>·</span>
              <span>100% Windows</span>
              <span>·</span>
              <span>Sin Almacenamiento en Nube</span>
            </div>
            <h3 className="text-base font-bold text-white tracking-tight mb-1">
              Servidor Ligero para Windows: Configuración & Despliegue 24/7
            </h3>
            <p className="text-xs text-neutral-400 max-w-3xl leading-relaxed">
              Sistema simple y sin complicaciones para mostrar cámaras Hikvision a clientes mediante enlaces web temporales. Todo funciona con doble clic en Windows, sin comandos Linux y sin costos de almacenamiento.
            </p>
          </div>

          {/* 3 Key Pillars: Windows 1-Click, 24/7 Hosting Options, Zero Cloud Storage */}
          <div className="grid grid-cols-1 md:grid-cols-3 gap-5">
            {/* Pillar 1: 1-Click BAT */}
            <div className="bg-neutral-900/90 border border-neutral-800 hover:border-blue-500/50 transition-all rounded-2xl p-5 flex flex-col justify-between shadow-lg">
              <div>
                <div className="w-10 h-10 rounded-xl bg-blue-500/10 text-blue-400 border border-blue-500/20 flex items-center justify-center mb-3">
                  <Play className="w-5 h-5 fill-current" />
                </div>
                <h4 className="text-sm font-bold text-white mb-2">
                  1. Arranque con 1 Clic (`start-windows.bat`)
                </h4>
                <p className="text-xs text-neutral-400 leading-relaxed mb-3">
                  MediaMTX es un ejecutable oficial nativo para Windows (<code className="text-blue-300 font-mono">mediamtx.exe</code>).
                  Solo haces doble clic en <code className="text-emerald-400 font-mono">start-windows.bat</code>. Si no tienes el archivo, el script lo descarga solo y lo enciende al instante.
                </p>
              </div>
              <div className="bg-neutral-950 p-2.5 rounded-xl border border-neutral-800 text-[11px] text-neutral-300 flex items-center gap-2">
                <CheckCircle className="w-4 h-4 text-emerald-400 shrink-0" />
                <span>Listo en tu descarga ZIP</span>
              </div>
            </div>

            {/* Pillar 2: 24/7 Server Options */}
            <div className="bg-neutral-900/90 border border-neutral-800 hover:border-blue-500/50 transition-all rounded-2xl p-5 flex flex-col justify-between shadow-lg">
              <div>
                <div className="w-10 h-10 rounded-xl bg-purple-500/10 text-purple-400 border border-purple-500/20 flex items-center justify-center mb-3">
                  <Server className="w-5 h-5" />
                </div>
                <h4 className="text-sm font-bold text-white mb-2">
                  2. Servidor Siempre Activo (24/7)
                </h4>
                <p className="text-xs text-neutral-400 leading-relaxed mb-3">
                  Para que las cámaras estén disponibles en cualquier momento que tú o tu cliente entren a la web, puedes usar un <strong>VPS con Windows Server</strong> o una PC/laptop dedicada en tu oficina o showroom.
                </p>
              </div>
              <div className="bg-neutral-950 p-2.5 rounded-xl border border-neutral-800 text-[11px] text-neutral-300 flex items-center gap-2">
                <CheckCircle className="w-4 h-4 text-purple-400 shrink-0" />
                <span>Control por Escritorio Remoto (RDP)</span>
              </div>
            </div>

            {/* Pillar 3: Zero Storage */}
            <div className="bg-neutral-900/90 border border-neutral-800 hover:border-blue-500/50 transition-all rounded-2xl p-5 flex flex-col justify-between shadow-lg">
              <div>
                <div className="w-10 h-10 rounded-xl bg-emerald-500/10 text-emerald-400 border border-emerald-500/20 flex items-center justify-center mb-3">
                  <CloudOff className="w-5 h-5" />
                </div>
                <h4 className="text-sm font-bold text-white mb-2">
                  3. Cero Almacenamiento en Nube
                </h4>
                <p className="text-xs text-neutral-400 leading-relaxed mb-3">
                  El servidor funciona en modo <strong>Bajo Demanda (<code className="text-sky-300 font-mono">sourceOnDemand: yes</code>)</strong>. No guarda grabaciones de video en la nube. Solo transmite en vivo cuando el cliente abre su enlace.
                </p>
              </div>
              <div className="bg-neutral-950 p-2.5 rounded-xl border border-neutral-800 text-[11px] text-neutral-300 flex items-center gap-2">
                <CheckCircle className="w-4 h-4 text-emerald-400 shrink-0" />
                <span>0 MB de video guardado en nube</span>
              </div>
            </div>
          </div>

          {/* In-Depth: How the Windows Server works */}
          <div className="bg-neutral-900 border border-neutral-800 rounded-2xl p-6 shadow-xl space-y-4">
            <div className="flex items-center gap-3">
              <div className="w-9 h-9 rounded-xl bg-blue-600/20 border border-blue-500/30 text-blue-400 flex items-center justify-center">
                <Monitor className="w-5 h-5" />
              </div>
              <div>
                <h4 className="text-sm font-bold text-white">
                  ¿Dónde ejecutar el servidor Windows para que esté siempre activo?
                </h4>
                <p className="text-xs text-neutral-400">
                  Opciones prácticas, sin necesidad de programación ni comandos
                </p>
              </div>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4 pt-2">
              {/* Option A: Cloud VPS with Windows Server */}
              <div className="bg-neutral-950 border border-blue-800/40 rounded-xl p-5 relative">
                <span className="absolute top-4 right-4 px-2 py-0.5 rounded text-[10px] font-bold bg-blue-900/60 text-blue-300 border border-blue-700">
                  RECOMENDADO
                </span>
                <div className="text-sm font-bold text-white mb-1 flex items-center gap-2">
                  <Server className="w-4 h-4 text-blue-400" />
                  Opción A: Servidor VPS con Windows Server 24/7
                </div>
                <p className="text-xs text-neutral-300 leading-relaxed mb-3">
                  Es una computadora virtual en la nube que nunca se apaga y tiene conexión a internet de alta velocidad permanente.
                </p>
                
                <div className="space-y-2 text-xs text-neutral-400 mb-4">
                  <div className="flex items-start gap-2">
                    <Check className="w-3.5 h-3.5 text-emerald-400 shrink-0 mt-0.5" />
                    <span><strong>Proveedores compatibles:</strong> Kamatera, Contabo (VPS con Windows), u OVHcloud.</span>
                  </div>
                  <div className="flex items-start gap-2">
                    <Check className="w-3.5 h-3.5 text-emerald-400 shrink-0 mt-0.5" />
                    <span><strong>¿Cómo se controla?:</strong> Abres la aplicación de tu Windows llamada <em>"Conexión a Escritorio Remoto" (mstsc)</em> e ingresas la IP del servidor.</span>
                  </div>
                  <div className="flex items-start gap-2">
                    <Check className="w-3.5 h-3.5 text-emerald-400 shrink-0 mt-0.5" />
                    <span><strong>Es un Windows idéntico al tuyo:</strong> Pegas la carpeta del sistema, haces doble clic a <code className="text-emerald-400 font-mono">start-windows.bat</code> y listo.</span>
                  </div>
                </div>
              </div>

              {/* Option B: PC or Laptop in your office */}
              <div className="bg-neutral-950 border border-neutral-800 rounded-xl p-5">
                <span className="px-2 py-0.5 rounded text-[10px] font-bold bg-neutral-800 text-neutral-300 border border-neutral-700 inline-block mb-2">
                  EN TU OFICINA / SHOWROOM
                </span>
                <div className="text-sm font-bold text-white mb-1 flex items-center gap-2">
                  <Laptop className="w-4 h-4 text-emerald-400" />
                  Opción B: Tu Propia Laptop o PC en la Oficina
                </div>
                <p className="text-xs text-neutral-300 leading-relaxed mb-3">
                  No compras nada. Usas la computadora con Windows que ya tienes en la oficina de SIDESEGUATE.
                </p>

                <div className="space-y-2 text-xs text-neutral-400">
                  <div className="flex items-start gap-2">
                    <Check className="w-3.5 h-3.5 text-emerald-400 shrink-0 mt-0.5" />
                    <span>Descomprimes el archivo <code className="text-neutral-300">sideseguate-streaming-plataforma.zip</code>.</span>
                  </div>
                  <div className="flex items-start gap-2">
                    <Check className="w-3.5 h-3.5 text-emerald-400 shrink-0 mt-0.5" />
                    <span>Haces doble clic en <code className="text-emerald-400 font-mono">start-windows.bat</code> y minimizas la ventana.</span>
                  </div>
                  <div className="flex items-start gap-2">
                    <Check className="w-3.5 h-3.5 text-emerald-400 shrink-0 mt-0.5" />
                    <span>Mientras la laptop esté encendida y conectada a internet, las cámaras se verán en cualquier teléfono o navegador que tenga el link.</span>
                  </div>
                </div>
              </div>
            </div>
          </div>

          {/* How Zero Cloud Storage works in detail */}
          <div className="bg-neutral-900 border border-emerald-900/40 rounded-2xl p-6 shadow-xl space-y-3">
            <div className="flex items-center gap-2">
              <span className="p-2 rounded-xl bg-emerald-950 text-emerald-400 border border-emerald-800">
                <CloudOff className="w-5 h-5" />
              </span>
              <div>
                <h4 className="text-sm font-bold text-white">
                  ¿Cómo funciona el sistema SIN guardar videos en la nube?
                </h4>
                <p className="text-xs text-neutral-400">
                  Transmisión bajo demanda (On-Demand Live Stream Proxy)
                </p>
              </div>
            </div>

            <p className="text-xs text-neutral-300 leading-relaxed">
              Muchos sistemas de cámaras te cobran mensualidades altas porque guardan semanas de video en la nube. En tu proyecto de SIDESEGUATE lo configuramos como un <strong>puente en vivo</strong>:
            </p>

            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 text-xs pt-1">
              <div className="bg-neutral-950 p-3 rounded-xl border border-neutral-800">
                <div className="font-bold text-neutral-200 mb-1">1. En reposo (Nadie mira)</div>
                <p className="text-neutral-400">El servidor no pide video a las cámaras. No consume ancho de banda y no escribe nada en el disco duro.</p>
              </div>
              <div className="bg-neutral-950 p-3 rounded-xl border border-neutral-800">
                <div className="font-bold text-blue-400 mb-1">2. Cliente abre el link</div>
                <p className="text-neutral-400">MediaMTX contacta de inmediato al DVR Hikvision, convierte la señal a formato web en memoria RAM y se la muestra al cliente.</p>
              </div>
              <div className="bg-neutral-950 p-3 rounded-xl border border-neutral-800">
                <div className="font-bold text-emerald-400 mb-1">3. Cliente cierra la pestaña</div>
                <p className="text-neutral-400">Al cabo de 10 segundos de inactividad, la conexión se desconecta sola. No queda ningún residuo guardado en el servidor.</p>
              </div>
            </div>
          </div>

          {/* Quick Script Viewer with Copy Button */}
          <div className="bg-neutral-900 border border-neutral-800 rounded-2xl p-6 shadow-xl space-y-3">
            <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3">
              <div>
                <h4 className="text-sm font-bold text-white flex items-center gap-2">
                  <Play className="w-4 h-4 text-emerald-400 fill-current" />
                  Archivo de Arranque Windows: start-windows.bat
                </h4>
                <p className="text-xs text-neutral-400">
                  Incluido en la carpeta principal del proyecto. Ejecutable con doble clic en Windows 10, 11 o Windows Server.
                </p>
              </div>

              <button
                onClick={() => handleCopy(`@echo off
TITLE SIDESEGUATE Streaming Gateway (MediaMTX Windows)
COLOR 0B

echo ===================================================================
echo   SIDESEGUATE - SERVIDOR DE STREAMING EN VIVO PARA WINDOWS
echo   Sin grabaciones en la nube - Solo transmision en vivo temporal
echo ===================================================================
echo.

IF NOT EXIST "mediamtx.exe" (
    echo [AVISO] No se encontro mediamtx.exe en esta carpeta.
    echo Descargando la version oficial de MediaMTX para Windows de 64 bits...
    powershell -Command "Invoke-WebRequest -Uri 'https://github.com/bluenviron/mediamtx/releases/latest/download/mediamtx_v1.9.3_windows_amd64.zip' -OutFile 'mediamtx_win.zip'"
    echo Descomprimiendo archivos...
    powershell -Command "Expand-Archive -Path 'mediamtx_win.zip' -DestinationPath '.' -Force"
    del mediamtx_win.zip
    echo Instalacion completada con exito.
    echo.
)

echo [OK] Iniciando pasarela de video MediaMTX para Windows...
echo [INFO] Puertos activos: RTSP :8554 | HLS Web :8888 | WebRTC :8889
echo [INFO] Minimiza esta ventana para mantener el streaming activo 24/7.
echo.
mediamtx.exe mediamtx.yml
pause`, 'bat')}
                className="px-3.5 py-2 bg-blue-600 hover:bg-blue-500 text-white rounded-xl text-xs font-semibold flex items-center gap-1.5 transition shadow-md"
              >
                {copiedKey === 'bat' ? <Check className="w-4 h-4" /> : <Copy className="w-4 h-4" />}
                {copiedKey === 'bat' ? 'Copiado al portapapeles' : 'Copiar start-windows.bat'}
              </button>
            </div>

            <pre className="bg-neutral-950 border border-neutral-800 text-emerald-400 font-mono text-[11px] p-4 rounded-xl overflow-x-auto leading-relaxed">
{`@echo off
TITLE SIDESEGUATE Streaming Gateway (MediaMTX Windows)
COLOR 0B

IF NOT EXIST "mediamtx.exe" (
    echo [AVISO] Descargando MediaMTX oficial para Windows...
    powershell -Command "Invoke-WebRequest -Uri 'https://github.com/bluenviron/mediamtx/releases/latest/download/mediamtx_v1.9.3_windows_amd64.zip' -OutFile 'mediamtx_win.zip'"
    powershell -Command "Expand-Archive -Path 'mediamtx_win.zip' -DestinationPath '.' -Force"
    del mediamtx_win.zip
)

echo [OK] Servidor de streaming en vivo activo.
mediamtx.exe mediamtx.yml
pause`}
            </pre>
          </div>
        </div>
      )}

      {/* Tab: Domain & Public Access Guide */}
      {activeTab === 'domain_guide' && (
        <div className="space-y-6">
          {/* Main Resolution Header */}
          <div className="bg-gradient-to-r from-neutral-900 via-neutral-900 to-sky-950/50 border border-sky-800/40 rounded-2xl p-6 shadow-xl">
            <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
              <div className="space-y-1">
                <div className="inline-flex items-center gap-2 px-2.5 py-1 rounded-full bg-emerald-950/80 border border-emerald-700/60 text-emerald-400 text-xs font-semibold">
                  <CheckCircle className="w-3.5 h-3.5" />
                  RESPUESTA DIRECTA: NO ES OBLIGATORIO COMPRAR DOMINIO
                </div>
                <h3 className="text-lg font-bold text-white tracking-tight pt-1">
                  ¿El panel administrativo y los enlaces de clientes necesitan dominio propio?
                </h3>
                <p className="text-xs text-neutral-300 max-w-3xl leading-relaxed">
                  Para empezar y entregarle el proyecto a tu cliente <strong>no necesitas gastar ni 1 centavo en un dominio</strong>. Puedes operar con enlaces directos seguros o túneles gratuitos. Un dominio propio solo es necesario si quieres que el enlace lleve formalmente el nombre de tu marca (ej. <code className="text-sky-300 font-mono">clientes.sideseguate.com</code>).
                </p>
              </div>
            </div>
          </div>

          {/* Key Distinction Box: Panel vs Stream */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="bg-neutral-900/80 border border-neutral-800 rounded-xl p-5">
              <div className="flex items-center gap-2.5 mb-2 text-sky-400 font-bold text-sm">
                <Laptop className="w-4 h-4" />
                1. El Panel Administrativo (Donde estás tú)
              </div>
              <p className="text-xs text-neutral-300 leading-relaxed mb-3">
                Este panel donde gestionas las cámaras, revisas auditorías y generas enlaces ya tiene su propia URL web segura (HTTPS) provista por la plataforma en la nube.
              </p>
              <div className="bg-neutral-950 p-2.5 rounded-lg border border-neutral-850 font-mono text-[11px] text-neutral-300 flex items-center justify-between">
                <span className="truncate">https://ais-pre-nck4w2eyds7z34626ouulx-772467661192.us-east1.run.app</span>
                <span className="text-[10px] text-emerald-400 font-bold uppercase shrink-0 ml-2">Ya activo con SSL</span>
              </div>
            </div>

            <div className="bg-neutral-900/80 border border-neutral-800 rounded-xl p-5">
              <div className="flex items-center gap-2.5 mb-2 text-amber-400 font-bold text-sm">
                <Server className="w-4 h-4" />
                2. El Servidor de Video en Windows (Tus Cámaras)
              </div>
              <p className="text-xs text-neutral-300 leading-relaxed mb-3">
                Es la máquina Windows que lee el RTSP del DVR Hikvision y lo convierte a video web. Los celulares de los clientes se conectan a este servidor cuando abren el enlace.
              </p>
              <div className="bg-neutral-950 p-2.5 rounded-lg border border-neutral-850 font-mono text-[11px] text-neutral-300 flex items-center justify-between">
                <span>MediaMTX WebRTC :8889 / HLS :8888</span>
                <span className="text-[10px] text-sky-400 font-bold uppercase shrink-0 ml-2">Requiere salida web</span>
              </div>
            </div>
          </div>

          {/* The 3 Real Working Options */}
          <div className="space-y-4">
            <h4 className="text-sm font-bold text-white flex items-center gap-2">
              <Globe className="w-4 h-4 text-sky-400" />
              Las 3 Opciones para conectar a los clientes a las cámaras:
            </h4>

            <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
              {/* Option 1: Cloudflare Tunnel (100% Free, No Domain Needed) */}
              <div className="bg-neutral-900/90 border-2 border-emerald-500/60 rounded-xl p-5 relative flex flex-col justify-between">
                <div>
                  <div className="flex items-center justify-between mb-2">
                    <span className="px-2 py-0.5 rounded text-[10px] font-bold bg-emerald-950 text-emerald-300 border border-emerald-700">
                      RECOMENDADO
                    </span>
                    <span className="text-xs font-bold text-emerald-400">Incluido</span>
                  </div>
                  <h5 className="text-sm font-bold text-white mb-1.5 flex items-center gap-2">
                    <Lock className="w-4 h-4 text-emerald-400" />
                    Túnel Seguro (Cloudflare o Ngrok)
                  </h5>
                  <p className="text-xs text-neutral-300 leading-relaxed mb-3">
                    Ejecutas <code className="text-emerald-400 font-mono">cloudflared.exe</code> en tu Windows. Te crea una URL segura HTTPS oficial sin abrir puertos en el router.
                  </p>
                  <div className="space-y-2 text-xs text-neutral-400 mb-4">
                    <div className="flex items-start gap-1.5">
                      <Check className="w-3.5 h-3.5 text-emerald-400 shrink-0 mt-0.5" />
                      <span><strong>Sin configurar dominio:</strong> Asigna una URL tipo <code className="text-sky-300 font-mono text-[11px]">https://sideseguate-vms.trycloudflare.com</code></span>
                    </div>
                    <div className="flex items-start gap-1.5">
                      <Check className="w-3.5 h-3.5 text-emerald-400 shrink-0 mt-0.5" />
                      <span><strong>Cero configuración en el router:</strong> Pasa a través del firewall de Claro o Tigo sin pedir permisos al proveedor de internet.</span>
                    </div>
                    <div className="flex items-start gap-1.5">
                      <Check className="w-3.5 h-3.5 text-emerald-400 shrink-0 mt-0.5" />
                      <span><strong>Candado SSL verde:</strong> Funciona en iPhone y Android sin advertencias de seguridad.</span>
                    </div>
                  </div>
                </div>
                <div className="bg-neutral-950 p-2.5 rounded-lg border border-neutral-850 text-[11px] text-neutral-400">
                  <span className="text-neutral-500 block text-[10px] font-bold">EJEMPLO ENLACE PARA EL CLIENTE:</span>
                  <code className="text-emerald-400 font-mono">https://camaras.trycloudflare.com/share?token=xyz</code>
                </div>
              </div>

              {/* Option 2: Own Domain / Subdomain */}
              <div className="bg-neutral-900/90 border border-neutral-800 rounded-xl p-5 flex flex-col justify-between">
                <div>
                  <div className="flex items-center justify-between mb-2">
                    <span className="px-2 py-0.5 rounded text-[10px] font-bold bg-sky-950 text-sky-300 border border-sky-800">
                      CORPORATIVO
                    </span>
                    <span className="text-xs font-bold text-neutral-300">Dominio Propio</span>
                  </div>
                  <h5 className="text-sm font-bold text-white mb-1.5 flex items-center gap-2">
                    <Globe className="w-4 h-4 text-sky-400" />
                    Subdominio con tu Marca Propia
                  </h5>
                  <p className="text-xs text-neutral-300 leading-relaxed mb-3">
                    Si tu empresa ya tiene una página web (ejemplo: <code className="text-white font-mono">sideseguate.com</code>), puedes usar un subdominio propio.
                  </p>
                  <div className="space-y-2 text-xs text-neutral-400 mb-4">
                    <div className="flex items-start gap-1.5">
                      <Check className="w-3.5 h-3.5 text-sky-400 shrink-0 mt-0.5" />
                      <span><strong>Creas un subdominio:</strong> En tu panel de dominio creas un registro tipo A o CNAME apuntando a tu servidor Windows.</span>
                    </div>
                    <div className="flex items-start gap-1.5">
                      <Check className="w-3.5 h-3.5 text-sky-400 shrink-0 mt-0.5" />
                      <span><strong>Nombre formal:</strong> <code className="text-sky-300 font-mono text-[11px]">clientes.sideseguate.com</code></span>
                    </div>
                    <div className="flex items-start gap-1.5">
                      <Check className="w-3.5 h-3.5 text-sky-400 shrink-0 mt-0.5" />
                      <span><strong>Máxima confianza:</strong> El cliente ve tu marca directa en WhatsApp y en su navegador.</span>
                    </div>
                  </div>
                </div>
                <div className="bg-neutral-950 p-2.5 rounded-lg border border-neutral-850 text-[11px] text-neutral-400">
                  <span className="text-neutral-500 block text-[10px] font-bold">EJEMPLO ENLACE PARA EL CLIENTE:</span>
                  <code className="text-sky-400 font-mono">https://clientes.sideseguate.com/share?token=xyz</code>
                </div>
              </div>

              {/* Option 3: Direct Public IP / Dynamic DNS */}
              <div className="bg-neutral-900/90 border border-neutral-800 rounded-xl p-5 flex flex-col justify-between">
                <div>
                  <div className="flex items-center justify-between mb-2">
                    <span className="px-2 py-0.5 rounded text-[10px] font-bold bg-neutral-800 text-neutral-400 border border-neutral-700">
                      TÉCNICO / BÁSICO
                    </span>
                    <span className="text-xs font-bold text-neutral-300">Red Directa</span>
                  </div>
                  <h5 className="text-sm font-bold text-white mb-1.5 flex items-center gap-2">
                    <Share2 className="w-4 h-4 text-neutral-400" />
                    IP Pública Directa o DDNS
                  </h5>
                  <p className="text-xs text-neutral-300 leading-relaxed mb-3">
                    Conectar directo a la IP pública del router abriendo los puertos 8889 y 8888 en el router de la oficina o cliente.
                  </p>
                  <div className="space-y-2 text-xs text-neutral-400 mb-4">
                    <div className="flex items-start gap-1.5">
                      <Check className="w-3.5 h-3.5 text-neutral-400 shrink-0 mt-0.5" />
                      <span><strong>Usa la IP numérica:</strong> Ej. <code className="text-neutral-300 font-mono text-[11px]">181.174.45.12:8889</code> o un DDNS como No-IP.</span>
                    </div>
                    <div className="flex items-start gap-1.5">
                      <AlertTriangle className="w-3.5 h-3.5 text-amber-400 shrink-0 mt-0.5" />
                      <span><strong>Desventaja en Celulares:</strong> Como no tiene certificado SSL (es <code className="text-amber-400 font-mono">http://</code> y no <code className="text-emerald-400 font-mono">https://</code>), Safari en iPhone o Chrome pueden alertar "Sitio no seguro" o bloquear el video WebRTC.</span>
                    </div>
                  </div>
                </div>
                <div className="bg-neutral-950 p-2.5 rounded-lg border border-neutral-850 text-[11px] text-neutral-400">
                  <span className="text-neutral-500 block text-[10px] font-bold">EJEMPLO ENLACE PARA EL CLIENTE:</span>
                  <code className="text-neutral-400 font-mono">http://181.174.45.12:8889/share?token=xyz</code>
                </div>
              </div>
            </div>
          </div>

          {/* Recommendation Box */}
          <div className="bg-neutral-900 border border-neutral-800 rounded-xl p-5">
            <h4 className="text-xs font-bold text-white uppercase tracking-wider mb-2 flex items-center gap-2">
              <Smartphone className="w-4 h-4 text-emerald-400" />
              ¿Qué te recomendamos hacer para tus demostraciones de cámaras?
            </h4>
            <div className="text-xs text-neutral-300 space-y-2 leading-relaxed">
              <p>
                <strong>1. Para envío inmediato de enlaces a tus clientes:</strong> Usa el enlace alojado en Google Cloud / Firebase Hosting junto con el túnel seguro hacia tu MediaMTX en Windows. El cliente abrirá el video en su celular desde cualquier parte de forma instantánea.
              </p>
              <p>
                <strong>2. Si deseas usar el dominio de tu empresa:</strong> Puedes asociar un subdominio como <code className="text-sky-300 font-mono">camaras.sideseguate.com</code> en Firebase Hosting cuando lo prefieras.
              </p>
            </div>
          </div>
        </div>
      )}

      {/* Tab 1: Architecture Pipeline */}
      {activeTab === 'architecture' && (
        <div className="space-y-6">
          {/* Client Real Credentials & Stream Encryption Notice */}
          <div className="bg-gradient-to-r from-neutral-900 via-neutral-900 to-blue-950/60 border border-blue-600/40 rounded-2xl p-5 shadow-xl">
            <div className="flex flex-col lg:flex-row items-start lg:items-center justify-between gap-4">
              <div>
                <div className="flex items-center gap-2 mb-1.5">
                  <span className="px-2 py-0.5 rounded bg-emerald-950 text-emerald-300 border border-emerald-800 text-[10px] font-bold">
                    DATOS REALES DEL CLIENTE REGISTRADOS
                  </span>
                  <span className="text-xs text-neutral-400">DVR iDS-7204HUHI-M1/S & DS-7108HGHI-F1/N</span>
                </div>
                <h3 className="text-sm font-bold text-white mb-1">
                  Credenciales de Autenticación & Código de Cifrado Hikvision
                </h3>
                <p className="text-xs text-neutral-300 leading-relaxed max-w-3xl">
                  Se configuraron los datos proporcionados por el cliente para la negociación RTSP y desencriptación de flujo en el Gateway MediaMTX:
                </p>
              </div>

              <div className="flex flex-wrap items-center gap-2 font-mono text-xs">
                <div className="bg-neutral-950 border border-neutral-800 px-3 py-2 rounded-xl">
                  <span className="text-neutral-500 block text-[10px]">USUARIO</span>
                  <span className="text-blue-400 font-bold">vi1fdr</span>
                </div>
                <div className="bg-neutral-950 border border-neutral-800 px-3 py-2 rounded-xl">
                  <span className="text-neutral-500 block text-[10px]">CONTRASEÑA</span>
                  <span className="text-white font-bold">Dvr232323</span>
                </div>
                <div className="bg-neutral-950 border border-amber-600/60 px-3 py-2 rounded-xl">
                  <span className="text-amber-400 block text-[10px] font-bold">CÓDIGO VERIFICACIÓN</span>
                  <span className="text-amber-300 font-bold tracking-widest">HELGDM</span>
                </div>
              </div>
            </div>

            {/* Crucial Technical Note about Stream Encryption */}
            <div className="mt-4 pt-3 border-t border-neutral-800/80 text-xs text-neutral-300 flex items-start gap-2.5">
              <ShieldCheck className="w-4 h-4 text-emerald-400 shrink-0 mt-0.5" />
              <div className="leading-relaxed">
                <strong className="text-white">Importante para el Técnico en Sitio:</strong> En los DVRs Hikvision AcuSense (como el <code className="text-blue-400 font-mono">iDS-7204HUHI-M1/S</code>), la función <em>Cifrado de Flujo (Stream Encryption)</em> viene habilitada con el código <code className="text-amber-300 font-mono font-bold">HELGDM</code>. Para que MediaMTX pueda transcodificar a HLS sin recibir cuadros negros, en el menú del DVR ve a: <strong>Configuración &gt; Red &gt; Ajustes Avanzados &gt; Acceso a la Plataforma</strong> y desactiva <strong>Cifrado de Flujo</strong> (te pedirá ingresar el código <code className="text-amber-300 font-mono">HELGDM</code> para confirmar).
              </div>
            </div>
          </div>

          {/* SADP Tool Local Network Diagnosis Card */}
          <div className="bg-neutral-900 border border-emerald-600/40 rounded-2xl p-5 shadow-xl space-y-3">
            <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-2">
              <div className="flex items-center gap-2">
                <span className="p-1.5 rounded-lg bg-emerald-950 text-emerald-400 border border-emerald-800">
                  <Activity className="w-4 h-4" />
                </span>
                <div>
                  <h3 className="text-sm font-bold text-white">
                    Diagnóstico SADP Tool en Sitio: DVR Hikvision en Red Local
                  </h3>
                  <p className="text-xs text-neutral-400">
                    Captura del software SADP del cliente (Modelo iDS-7108HQHI-M1/S0, 8 Canales)
                  </p>
                </div>
              </div>
              <span className="px-2.5 py-1 rounded-full text-xs font-mono font-bold bg-blue-950 text-blue-300 border border-blue-800">
                LAN IP: 192.168.1.41
              </span>
            </div>

            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 text-xs font-mono">
              <div className="bg-neutral-950 p-2.5 rounded-xl border border-neutral-800">
                <span className="text-[10px] text-neutral-500 block">IP LOCAL DVR</span>
                <span className="text-emerald-400 font-bold">192.168.1.41</span>
              </div>
              <div className="bg-neutral-950 p-2.5 rounded-xl border border-neutral-800">
                <span className="text-[10px] text-neutral-500 block">GATEWAY / ROUTER</span>
                <span className="text-white font-bold">192.168.1.1</span>
              </div>
              <div className="bg-neutral-950 p-2.5 rounded-xl border border-neutral-800">
                <span className="text-[10px] text-neutral-500 block">PUERTOS (RTSP/SDK)</span>
                <span className="text-sky-400 font-bold">554 / 8000</span>
              </div>
              <div className="bg-neutral-950 p-2.5 rounded-xl border border-neutral-800">
                <span className="text-[10px] text-neutral-500 block">DIRECCIÓN MAC</span>
                <span className="text-neutral-300 font-bold text-[11px]">e0:ba:ad:cd:bc:05</span>
              </div>
            </div>

            <div className="p-3 bg-amber-950/40 border border-amber-700/60 rounded-xl text-xs text-amber-200 leading-relaxed flex items-start gap-2">
              <AlertTriangle className="w-4 h-4 text-amber-400 shrink-0 mt-0.5" />
              <div>
                <strong>Recomendación Crítica para el Técnico en SADP:</strong> En la ventana de parámetros de red se observa la casilla <code>Enable DHCP</code> marcada. Se debe <strong>desmarcar Enable DHCP</strong> y guardar con la contraseña del administrador para que la IP <code>192.168.1.41</code> quede fija (estática) y no cambie si el router de la empresa se reinicia.
              </div>
            </div>
          </div>

          {/* Interactive Pipeline Steps */}
          <div className="bg-neutral-900 border border-neutral-800 rounded-2xl p-6 shadow-xl">
            <h3 className="text-sm font-bold text-white mb-4 flex items-center gap-2">
              <Workflow className="w-4 h-4 text-blue-400" />
              Pipeline de Streaming de Baja Latencia: De la Cámara al Navegador del Cliente
            </h3>

            <div className="grid grid-cols-1 md:grid-cols-4 gap-4 relative">
              {/* Step 1 */}
              <div className="bg-neutral-950 border border-neutral-800 rounded-xl p-4 flex flex-col justify-between">
                <div>
                  <div className="text-[11px] font-bold text-blue-400 mb-1">PASO 1 • ORIGEN</div>
                  <h4 className="text-sm font-semibold text-white mb-2">Cámaras & DVRs</h4>
                  <p className="text-xs text-neutral-400 leading-relaxed">
                    Hikvision DVR/NVR y cámaras IP en routers locales transmiten el flujo de video crudo.
                  </p>
                </div>
                <div className="mt-4 pt-3 border-t border-neutral-800 text-[11px] font-mono text-emerald-400 bg-neutral-900 px-2 py-1 rounded">
                  Protocolo: RTSP (TCP :554)
                </div>
              </div>

              {/* Step 2 */}
              <div className="bg-neutral-950 border border-neutral-800 rounded-xl p-4 flex flex-col justify-between">
                <div>
                  <div className="text-[11px] font-bold text-blue-400 mb-1">PASO 2 • GATEWAY</div>
                  <h4 className="text-sm font-semibold text-white mb-2">MediaMTX + FFmpeg</h4>
                  <p className="text-xs text-neutral-400 leading-relaxed">
                    Instalado en servidor VPS Ubuntu. Ingiere RTSP bajo demanda y remultiplexa a formatos web nativos.
                  </p>
                </div>
                <div className="mt-4 pt-3 border-t border-neutral-800 text-[11px] font-mono text-sky-400 bg-neutral-900 px-2 py-1 rounded">
                  HLS (:8888) / WebRTC (:8889)
                </div>
              </div>

              {/* Step 3 */}
              <div className="bg-neutral-950 border border-neutral-800 rounded-xl p-4 flex flex-col justify-between">
                <div>
                  <div className="text-[11px] font-bold text-blue-400 mb-1">PASO 3 • PLATAFORMA</div>
                  <h4 className="text-sm font-semibold text-white mb-2">SIDESEGUATE Web</h4>
                  <p className="text-xs text-neutral-400 leading-relaxed">
                    Control de proyectos, permisos, generación de enlaces privados, PIN y expiración configurable.
                  </p>
                </div>
                <div className="mt-4 pt-3 border-t border-neutral-800 text-[11px] font-mono text-purple-400 bg-neutral-900 px-2 py-1 rounded">
                  HTTPS + Tokens Cifrados
                </div>
              </div>

              {/* Step 4 */}
              <div className="bg-neutral-950 border border-neutral-800 rounded-xl p-4 flex flex-col justify-between">
                <div>
                  <div className="text-[11px] font-bold text-blue-400 mb-1">PASO 4 • DESTINO</div>
                  <h4 className="text-sm font-semibold text-white mb-2">Cliente Final</h4>
                  <p className="text-xs text-neutral-400 leading-relaxed">
                    El cliente abre el link en Chrome, Safari, Edge o móvil. Cero descargas, cero apps de terceros.
                  </p>
                </div>
                <div className="mt-4 pt-3 border-t border-neutral-800 text-[11px] font-mono text-emerald-400 bg-neutral-900 px-2 py-1 rounded">
                  Zero Install • Móvil & PC
                </div>
              </div>
            </div>
          </div>

          {/* Equipment Viability Grid */}
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            {/* Hikvision DVR */}
            <div className="bg-neutral-900 border border-neutral-800 rounded-2xl p-5 shadow-lg">
              <div className="flex items-center justify-between mb-3">
                <span className="font-bold text-sm text-white">Hikvision DVR/NVR</span>
                <span className="px-2 py-0.5 rounded text-[10px] font-bold bg-emerald-950 text-emerald-400 border border-emerald-700/60 flex items-center gap-1">
                  <CheckCircle2 className="w-3 h-3" />
                  MÁXIMA VIABILIDAD
                </span>
              </div>
              <p className="text-xs text-neutral-400 leading-relaxed mb-3">
                Hikvision soporta RTSP y ONVIF de fábrica. La sintaxis <code className="text-blue-400 font-mono">/Streaming/Channels/101</code> permite conectar canales independientes tanto en flujo principal (1080p) como en substream (720p).
              </p>
              <div className="text-[11px] text-neutral-400 bg-neutral-950 p-2.5 rounded-lg border border-neutral-800 flex items-center gap-1.5">
                <Check className="w-3.5 h-3.5 text-emerald-400 shrink-0" />
                <span>Probado y garantizado para integración con MediaMTX.</span>
              </div>
            </div>

            {/* Hikvision IP Cam */}
            <div className="bg-neutral-900 border border-neutral-800 rounded-2xl p-5 shadow-lg">
              <div className="flex items-center justify-between mb-3">
                <span className="font-bold text-sm text-white">Cámara IP Hikvision</span>
                <span className="px-2 py-0.5 rounded text-[10px] font-bold bg-emerald-950 text-emerald-400 border border-emerald-700/60 flex items-center gap-1">
                  <CheckCircle2 className="w-3 h-3" />
                  OPCIÓN RECOMENDADA
                </span>
              </div>
              <p className="text-xs text-neutral-400 leading-relaxed mb-3">
                Conectada directamente al router con cable de red o POE. Permite trabajar directamente con RTSP/ONVIF sin depender de un DVR intermedio y soporta control de giro PTZ web.
              </p>
              <div className="text-[11px] text-neutral-400 bg-neutral-950 p-2.5 rounded-lg border border-neutral-800 flex items-center gap-1.5">
                <Check className="w-3.5 h-3.5 text-emerald-400 shrink-0" />
                <span>Ideal para la prueba de concepto y entrega al cliente.</span>
              </div>
            </div>

            {/* Dahua / ONVIF RTSP */}
            <div className="bg-neutral-900 border border-neutral-800 rounded-2xl p-5 shadow-lg">
              <div className="flex items-center justify-between mb-3">
                <span className="font-bold text-sm text-white">Dahua / ONVIF RTSP</span>
                <span className="px-2 py-0.5 rounded text-[10px] font-bold bg-emerald-950 text-emerald-400 border border-emerald-700/60 flex items-center gap-1">
                  <CheckCircle2 className="w-3 h-3" />
                  100% COMPATIBLE
                </span>
              </div>
              <p className="text-xs text-neutral-400 leading-relaxed mb-3">
                Cualquier DVR o cámara IP con protocolo estándar RTSP/ONVIF en red local (puerto 554) se integra directamente al Gateway de MediaMTX sin hardware propietario.
              </p>
              <div className="text-[11px] text-neutral-400 bg-neutral-950 p-2.5 rounded-lg border border-neutral-800 flex items-center gap-1.5">
                <Check className="w-3.5 h-3.5 text-emerald-400 shrink-0" />
                <span>Soporta plantillas multi-canal automáticas.</span>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Tab 3: mediamtx.yml */}
      {activeTab === 'mediamtx_yml' && (
        <div className="bg-neutral-900 border border-neutral-800 rounded-2xl p-6 shadow-xl space-y-4">
          <div className="flex items-center justify-between">
            <div>
              <h3 className="text-sm font-bold text-white flex items-center gap-2">
                <FileCode className="w-4 h-4 text-blue-400" />
                Archivo de Configuración: /etc/mediamtx.yml
              </h3>
              <p className="text-xs text-neutral-400">
                Generado automáticamente con las {cameras.length} cámaras configuradas en SIDESEGUATE
              </p>
            </div>

            <button
              onClick={() => handleCopy(mediamtxYaml, 'mediamtx')}
              className="px-3 py-1.5 bg-blue-600 hover:bg-blue-500 text-white rounded-lg text-xs font-medium flex items-center gap-1.5 transition"
            >
              {copiedKey === 'mediamtx' ? <Check className="w-3.5 h-3.5" /> : <Copy className="w-3.5 h-3.5" />}
              {copiedKey === 'mediamtx' ? 'Copiado al portapapeles' : 'Copiar YAML'}
            </button>
          </div>

          <pre className="bg-neutral-950 border border-neutral-800 text-emerald-400 font-mono text-[11px] p-4 rounded-xl overflow-x-auto max-h-[460px] leading-relaxed">
            {mediamtxYaml}
          </pre>
        </div>
      )}
    </div>
  );
};
