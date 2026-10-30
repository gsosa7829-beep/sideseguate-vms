import React, { useState } from 'react';
import { LOGO_URL } from '../lib/assets';
import { getPublicBaseUrl } from '../lib/publicUrl';
import { Camera, Project } from '../lib/types';
import {
  ClientCameraSubmissionInput,
  validateClientCameraSubmission,
  buildClientSubmittedCameras,
  maskRtspUrl,
} from '../lib/rtspHelper';
import { getCameraMediaMtxPath } from '../lib/pcLauncherGenerator';
import {
  Cctv,
  Plus,
  CheckCircle2,
  Copy,
  Check,
  MessageCircle,
  Server,
  ShieldCheck,
  Wifi,
  ArrowLeft,
  Sparkles,
  ExternalLink,
  Layers,
  KeyRound,
  Globe,
  FileCode,
  Eye,
} from 'lucide-react';
import { buildWhatsAppUrl } from '../lib/whatsapp';

interface ClientCameraOnboardingViewProps {
  projects: Project[];
  cameras: Camera[];
  defaultProjectId?: string;
  isStandaloneClientMode?: boolean;
  onAddCamerasBatch: (newCameras: Camera[], clientName: string) => void;
  onExitStandaloneMode?: () => void;
  onOpenStandalonePreview?: (projectId: string) => void;
  onNavigateToYaml?: () => void;
  onSelectCameraInMonitor?: (cameraId: string) => void;
}

export const ClientCameraOnboardingView: React.FC<ClientCameraOnboardingViewProps> = ({
  projects,
  cameras,
  defaultProjectId,
  isStandaloneClientMode = false,
  onAddCamerasBatch,
  onExitStandaloneMode,
  onOpenStandalonePreview,
  onNavigateToYaml,
  onSelectCameraInMonitor,
}) => {
  const initialProj =
    projects.find((p) => p.id === defaultProjectId) || projects[0] || {
      id: 'proj-sideseguate-01',
      name: 'Cliente SIDESEGUATE',
      clientName: 'Cliente Autorizado',
      clientPhone: '+502',
      location: 'Guatemala',
      status: 'activo' as const,
      equipmentNotes: '',
      createdAt: new Date().toISOString(),
    };

  const [selectedProjectId, setSelectedProjectId] = useState<string>(initialProj.id);
  const currentProject = projects.find((p) => p.id === selectedProjectId) || initialProj;

  // Form fields for Client Self-Service Camera Registration (Pre-filled with real client hardware)
  const [clientName, setClientName] = useState<string>(currentProject.clientName || 'Ingeniería SIDESEGUATE');
  const [cameraNamePrefix, setCameraNamePrefix] = useState<string>('EQUIPO DE PRUEBA (FB2200254)');
  const [locationDesc, setLocationDesc] = useState<string>(currentProject.location || 'Red Local 192.168.1.41');
  const [brand, setBrand] = useState<ClientCameraSubmissionInput['brand']>('hikvision_dvr');
  const [host, setHost] = useState<string>('192.168.1.41');
  const [port, setPort] = useState<number>(554);
  const [onvifPort, setOnvifPort] = useState<number>(8000);
  const [username, setUsername] = useState<string>('');
  const [password, setPassword] = useState<string>('');
  const [channelsCount, setChannelsCount] = useState<number>(4);
  const [startChannel, setStartChannel] = useState<number>(1);
  const [streamType, setStreamType] = useState<'main' | 'sub'>('main');
  const [verificationCode, setVerificationCode] = useState<string>('');
  const [ptzSupported, setPtzSupported] = useState<boolean>(false);

  const [formError, setFormError] = useState<string | null>(null);
  const [lastSubmittedCameras, setLastSubmittedCameras] = useState<Camera[]>([]);
  const [copiedOnboardingUrl, setCopiedOnboardingUrl] = useState<boolean>(false);

  const handleProjectChange = (projId: string) => {
    setSelectedProjectId(projId);
    const found = projects.find((p) => p.id === projId);
    if (found) {
      setClientName(found.clientName);
      setLocationDesc(found.location);
    }
  };

  const getOnboardingUrl = (projId: string) => {
    const baseUrl = getPublicBaseUrl();
    return `${baseUrl}?onboarding=${encodeURIComponent(projId)}`;
  };

  const handleCopyOnboardingLink = () => {
    const url = getOnboardingUrl(selectedProjectId);
    navigator.clipboard.writeText(url);
    setCopiedOnboardingUrl(true);
    setTimeout(() => setCopiedOnboardingUrl(false), 2500);
  };

  const getWhatsAppOnboardingShareUrl = () => {
    const url = getOnboardingUrl(selectedProjectId);
    const msg = `Hola ${currentProject.clientName}, te comparto el Portal de Auto-Registro de Cámaras de SIDESEGUATE:\n\n${url}\n\nDesde ahí puedes ingresar fácilmente la IP, usuario y canales de tus cámaras o DVR para que nuestro servidor las agregue automáticamente en vivo.`;
    return buildWhatsAppUrl({ text: msg, phone: currentProject.clientPhone });
  };

  // Preview RTSP URLs before submitting
  const previewCameras = buildClientSubmittedCameras({
    projectId: selectedProjectId,
    clientName: clientName || 'Cliente',
    cameraNamePrefix: cameraNamePrefix || 'Cámara',
    locationDesc: locationDesc || 'Ubicación',
    brand,
    host: host || '192.168.1.64',
    port: port || 554,
    onvifPort: onvifPort || 8000,
    username: username || 'admin',
    password,
    channelsCount,
    startChannel,
    streamType,
    verificationCode,
    ptzSupported,
  });

  const handleSubmitClientCameras = (e: React.FormEvent) => {
    e.preventDefault();
    const validation = validateClientCameraSubmission({
      host,
      cameraNamePrefix,
      username,
      port,
    });

    if (!validation.valid) {
      setFormError(validation.error || 'Por favor verifica los datos de la cámara.');
      return;
    }

    setFormError(null);
    const generated = buildClientSubmittedCameras({
      projectId: selectedProjectId,
      clientName,
      cameraNamePrefix,
      locationDesc,
      brand,
      host,
      port,
      onvifPort,
      username,
      password,
      channelsCount,
      startChannel,
      streamType,
      verificationCode,
      ptzSupported,
    });

    setLastSubmittedCameras(generated);
    onAddCamerasBatch(generated, clientName);
  };

  return (
    <div className={isStandaloneClientMode ? 'min-h-dvh bg-neutral-950 text-neutral-100 p-4 sm:p-8' : 'space-y-6'}>
      <div className={isStandaloneClientMode ? 'max-w-5xl mx-auto space-y-6' : 'space-y-6'}>
        {/* Standalone Client Portal Top Header */}
        {isStandaloneClientMode && (
          <header className="bg-neutral-900 border border-neutral-800 rounded-2xl p-4 sm:p-5 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 shadow-xl">
            <div className="flex items-center gap-3.5">
              <div className="w-11 h-11 rounded-xl overflow-hidden bg-white flex items-center justify-center shrink-0 border border-sky-500/40 shadow-sm">
                <img
                  src={LOGO_URL}
                  alt="SIDESEGUATE"
                  className="w-full h-full object-cover"
                />
              </div>
              <div>
                <div className="flex items-center gap-2">
                  <span className="text-xs font-mono uppercase tracking-wider text-sky-400 font-semibold">
                    SIDESEGUATE · Portal de Autogestión
                  </span>
                  <span className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse" />
                </div>
                <h1 className="text-base sm:text-lg font-bold text-white">
                  Registro Fácil de Cámaras y DVR al Servidor Central
                </h1>
                <p className="text-xs text-neutral-400">
                  Cliente: <strong className="text-neutral-200">{currentProject.name}</strong> ({currentProject.clientName})
                </p>
              </div>
            </div>

            {onExitStandaloneMode && (
              <button
                type="button"
                onClick={onExitStandaloneMode}
                className="px-3.5 py-2 bg-neutral-800 hover:bg-neutral-700 text-neutral-200 rounded-xl text-xs font-semibold flex items-center gap-1.5 border border-neutral-700 transition shrink-0"
              >
                <ArrowLeft className="w-4 h-4" />
                <span>Volver al Panel Administrador</span>
              </button>
            )}
          </header>
        )}

        {/* Engineer Quick-Add Header Bar */}
        {!isStandaloneClientMode && (
          <div className="bg-neutral-900 border border-neutral-800 rounded-xl p-4 sm:p-5 space-y-4">
            <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4">
              <div>
                <div className="flex items-center gap-2 flex-wrap">
                  <h2 className="text-sm font-bold text-white flex items-center gap-2">
                    <Sparkles className="w-4 h-4 text-sky-400" />
                    Asistente de Ingeniería: Registro Rápido de Cámaras y DVRs al Servidor
                  </h2>
                  <span className="text-[11px] font-mono text-emerald-400 flex items-center gap-1">
                    <Server className="w-3.5 h-3.5 text-emerald-400" />
                    Inyección Automática a MediaMTX + Cloud Firestore
                  </span>
                </div>
                <p className="text-xs text-neutral-400 mt-1 max-w-3xl leading-relaxed">
                  Diseñado para que el ingeniero agregue cualquier cámara IP PoE o un DVR completo (4, 8 o 16 canales) ingresando únicamente la IP, puerto, usuario y contraseña. El sistema construye automáticamente las direcciones RTSP y actualiza el archivo <code className="text-sky-300 font-mono">mediamtx.yml</code> y el lanzador <code className="text-emerald-300 font-mono">.BAT</code> del servidor sin tocar código.
                </p>
              </div>

              <div className="flex flex-wrap items-center gap-2 shrink-0">
                {onNavigateToYaml && (
                  <button
                    type="button"
                    onClick={onNavigateToYaml}
                    className="px-3 py-2 bg-neutral-950 hover:bg-neutral-800 text-sky-300 border border-neutral-800 rounded-lg text-xs font-semibold flex items-center gap-1.5 transition"
                  >
                    <FileCode className="w-3.5 h-3.5 text-sky-400" />
                    <span>Ver Configuración del Servidor (mediamtx.yml)</span>
                  </button>
                )}

                <button
                  type="button"
                  onClick={handleCopyOnboardingLink}
                  className="px-3 py-2 bg-neutral-950 hover:bg-neutral-800 text-neutral-200 border border-neutral-800 rounded-lg text-xs font-semibold flex items-center gap-1.5 transition"
                >
                  {copiedOnboardingUrl ? (
                    <Check className="w-3.5 h-3.5 text-emerald-400" />
                  ) : (
                    <Copy className="w-3.5 h-3.5 text-sky-400" />
                  )}
                  <span>{copiedOnboardingUrl ? 'Enlace Copiado' : 'Copiar Enlace Directo a este Formulario'}</span>
                </button>

                <a
                  href={getWhatsAppOnboardingShareUrl()}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="px-3 py-2 bg-emerald-600/20 hover:bg-emerald-600/30 text-emerald-300 border border-emerald-500/30 rounded-lg text-xs font-semibold flex items-center gap-1.5 transition"
                >
                  <MessageCircle className="w-3.5 h-3.5 text-emerald-400" />
                  <span>Compartir por WhatsApp</span>
                </a>

                {onOpenStandalonePreview && (
                  <button
                    type="button"
                    onClick={() => onOpenStandalonePreview(selectedProjectId)}
                    className="px-3.5 py-2 bg-sky-600 hover:bg-sky-500 text-white rounded-lg text-xs font-semibold flex items-center gap-1.5 shadow-sm transition"
                  >
                    <ExternalLink className="w-3.5 h-3.5" />
                    <span>Modo Pantalla Completa</span>
                  </button>
                )}
              </div>
            </div>

            {/* Project Selector & Generated URL Bar */}
            <div className="pt-3 border-t border-neutral-800 grid grid-cols-1 md:grid-cols-3 gap-3 items-center text-xs">
              <div>
                <label htmlFor="onboarding-project-select" className="block text-[11px] text-neutral-400 mb-1">
                  Proyecto / Instalación donde se conectarán las cámaras:
                </label>
                <select
                  id="onboarding-project-select"
                  value={selectedProjectId}
                  onChange={(e) => handleProjectChange(e.target.value)}
                  className="w-full bg-neutral-950 border border-neutral-800 rounded-lg px-3 py-2 text-xs text-white focus:outline-none focus:border-sky-500"
                >
                  {projects.map((p) => (
                    <option key={p.id} value={p.id}>
                      {p.name} ({p.clientName})
                    </option>
                  ))}
                </select>
              </div>

              <div className="md:col-span-2">
                <span className="block text-[11px] text-neutral-400 mb-1">
                  Acceso rápido desde celular o campo para agregar cámaras remotamente:
                </span>
                <div className="bg-neutral-950 border border-neutral-800 rounded-lg px-3 py-2 font-mono text-[11px] text-sky-400 truncate select-all">
                  {getOnboardingUrl(selectedProjectId)}
                </div>
              </div>
            </div>
          </div>
        )}

        {/* Main 2-Column Grid: Step-by-Step Form + Real-Time Server Provisioning Preview */}
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
          {/* Left 7 Cols: Easy Camera Form */}
          <form
            onSubmit={handleSubmitClientCameras}
            className="lg:col-span-7 bg-neutral-900 border border-neutral-800 rounded-2xl p-5 sm:p-6 space-y-5 shadow-lg"
          >
            <div className="flex items-center justify-between border-b border-neutral-800 pb-3.5">
              <div>
                <span className="text-[11px] font-mono uppercase tracking-wider text-sky-400 font-semibold">
                  Paso 1 al 3 · Configuración Rápida sin Escribir RTSP Manual
                </span>
                <h3 className="text-base font-bold text-white mt-0.5">
                  Ingresa la IP y Datos de la Cámara o DVR
                </h3>
              </div>
              <Cctv className="w-6 h-6 text-sky-400 shrink-0" />
            </div>

            {/* 1-Click Quick Hardware Presets from SADP Tool & iVMS-4200 */}
            <div className="bg-neutral-950/90 border border-neutral-800 rounded-xl p-3 space-y-2">
              <div className="flex items-center justify-between">
                <span className="text-[11px] font-mono uppercase tracking-wider text-emerald-400 font-semibold">
                  Equipos Detectados en SADP Tool / iVMS-4200 (Autocompletar en 1 Clic)
                </span>
                <span className="text-[10px] font-mono text-neutral-500">
                  Sin credenciales guardadas
                </span>
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-1.5">
                {[
                  {
                    label: 'EQUIPO DE PRUEBA (FB2200254 · 4CH)',
                    sub: 'iDS-7204HUHI-M1/S · 4 canales',
                    prefix: 'EQUIPO DE PRUEBA (FB2200254)',
                    ip: '192.168.1.41',
                    ch: 4,
                    devBrand: 'hikvision_dvr' as const,
                    loc: 'DVR 4CH iDS-7204HUHI-M1/S (SN: FB2200254)',
                  },
                  {
                    label: 'DVR 8CH AcuSense (L18365299)',
                    sub: 'iDS-7108HQHI-M1/S0 · IP 192.168.1.41',
                    prefix: 'DVR AcuSense (L18365299)',
                    ip: '192.168.1.41',
                    ch: 8,
                    devBrand: 'hikvision_dvr' as const,
                    loc: 'DVR 8CH iDS-7108HQHI-M1/S0 · MAC e0:ba:ad:cd:bc:05',
                  },
                  {
                    label: 'DVR 8CH TurboHD (F30392314)',
                    sub: 'DS-7108HGHI-F1/N · 8 Canales BNC',
                    prefix: 'DVR TurboHD (F30392314)',
                    ip: '192.168.1.42',
                    ch: 8,
                    devBrand: 'hikvision_dvr' as const,
                    loc: 'DVR 8CH DS-7108HGHI-F1/N (SN: F30392314)',
                  },
                  {
                    label: 'Cámara IP PoE (SADP 1CH)',
                    sub: 'MAC a4-d5-c2 / 04-03-12 · 1 Canal',
                    prefix: 'Cámara IP Directa',
                    ip: '192.168.1.64',
                    ch: 1,
                    devBrand: 'hikvision_ip' as const,
                    loc: 'Cámara IP Hikvision en Red Local',
                  },
                ].map((preset) => (
                  <button
                    key={preset.label}
                    type="button"
                    onClick={() => {
                      setBrand(preset.devBrand);
                      setCameraNamePrefix(preset.prefix);
                      setHost(preset.ip);
                      setPort(554);
                      setOnvifPort(8000);
                      setUsername('');
                      setPassword('');
                      setVerificationCode('');
                      setChannelsCount(preset.ch);
                      setLocationDesc(preset.loc);
                    }}
                    className="text-left p-2 rounded-lg bg-neutral-900 hover:bg-neutral-800 border border-neutral-800 hover:border-sky-500/50 transition"
                  >
                    <div className="text-xs font-bold text-white truncate">{preset.label}</div>
                    <div className="text-[10px] font-mono text-neutral-400 truncate">{preset.sub}</div>
                  </button>
                ))}
              </div>
            </div>

            {/* Step 1: Select Device Brand & Quantity of Channels */}
            <div className="space-y-3">
              <div className="text-xs font-semibold text-neutral-200 flex items-center gap-2">
                <span className="w-5 h-5 rounded-full bg-sky-500/20 border border-sky-500/40 text-sky-300 font-mono text-[11px] flex items-center justify-center">
                  1
                </span>
                <span>¿Qué tipo de equipo deseas conectar al servidor?</span>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
                {[
                  { id: 'hikvision_dvr', title: 'Hikvision DVR / NVR', desc: 'TurboHD / AcuSense (4/8/16 CH)' },
                  { id: 'hikvision_ip', title: 'Cámara IP PoE', desc: 'Hikvision / ONVIF Directa' },
                  { id: 'dahua_dvr', title: 'Dahua / Genérica RTSP', desc: 'DVR o Cámara ONVIF Estándar' },
                ].map((item) => {
                  const active = brand === item.id;
                  return (
                    <button
                      key={item.id}
                      type="button"
                      onClick={() => {
                        setBrand(item.id as ClientCameraSubmissionInput['brand']);
                        if (item.id === 'hikvision_ip') {
                          setChannelsCount(1);
                        }
                      }}
                      className={`p-2.5 rounded-xl border text-left transition ${
                        active
                          ? 'bg-sky-950/60 border-sky-500 text-white shadow-xs'
                          : 'bg-neutral-950 border-neutral-800 text-neutral-400 hover:border-neutral-700 hover:text-neutral-200'
                      }`}
                    >
                      <div className="text-xs font-bold">{item.title}</div>
                      <div className="text-[10px] text-neutral-400 mt-0.5">{item.desc}</div>
                    </button>
                  );
                })}
              </div>

              {/* Number of channels quick selector */}
              <div className="pt-1">
                <label className="block text-xs text-neutral-300 mb-1.5">
                  ¿Cuántas cámaras (canales) tiene este equipo?
                </label>
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
                  {[
                    { count: 1, label: '1 Cámara única' },
                    { count: 4, label: 'DVR 4 Canales' },
                    { count: 8, label: 'DVR 8 Canales' },
                    { count: 16, label: 'DVR 16 Canales' },
                  ].map((opt) => (
                    <button
                      key={opt.count}
                      type="button"
                      onClick={() => setChannelsCount(opt.count)}
                      className={`py-2 px-2.5 rounded-lg border text-xs font-semibold transition ${
                        channelsCount === opt.count
                          ? 'bg-sky-600 border-sky-500 text-white'
                          : 'bg-neutral-950 border-neutral-800 text-neutral-300 hover:border-neutral-700'
                      }`}
                    >
                      {opt.label}
                    </button>
                  ))}
                </div>
              </div>
            </div>

            {/* Step 2: IP Address, Port & Credentials */}
            <div className="space-y-3 pt-2 border-t border-neutral-800/80">
              <div className="text-xs font-semibold text-neutral-200 flex items-center gap-2">
                <span className="w-5 h-5 rounded-full bg-sky-500/20 border border-sky-500/40 text-sky-300 font-mono text-[11px] flex items-center justify-center">
                  2
                </span>
                <span>Dirección IP y Credenciales de la Cámara / DVR</span>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                <div className="sm:col-span-2">
                  <label htmlFor="client-cam-host" className="block text-xs text-neutral-300 mb-1">
                    Dirección IP (Local o Pública) / Dominio DDNS *
                  </label>
                  <div className="relative">
                    <Globe className="w-3.5 h-3.5 text-neutral-500 absolute left-3 top-2.5" />
                    <input
                      id="client-cam-host"
                      type="text"
                      value={host}
                      onChange={(e) => setHost(e.target.value)}
                      placeholder="Ej. 192.168.1.64 o 190.149.45.88"
                      className="w-full bg-neutral-950 border border-neutral-800 rounded-lg pl-8 pr-3 py-2 text-xs font-mono text-white focus:outline-none focus:border-sky-500"
                    />
                  </div>
                </div>

                <div>
                  <label htmlFor="client-cam-port" className="block text-xs text-neutral-300 mb-1">
                    Puerto RTSP (Defecto 554)
                  </label>
                  <input
                    id="client-cam-port"
                    type="number"
                    value={port}
                    onChange={(e) => setPort(Number(e.target.value) || 554)}
                    placeholder="554"
                    className="w-full bg-neutral-950 border border-neutral-800 rounded-lg px-3 py-2 text-xs font-mono text-white focus:outline-none focus:border-sky-500"
                  />
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                <div>
                  <label htmlFor="client-cam-user" className="block text-xs text-neutral-300 mb-1">
                    Usuario de Cámara / DVR *
                  </label>
                  <input
                    id="client-cam-user"
                    type="text"
                    value={username}
                    onChange={(e) => setUsername(e.target.value)}
                    placeholder="admin"
                    className="w-full bg-neutral-950 border border-neutral-800 rounded-lg px-3 py-2 text-xs font-mono text-white focus:outline-none focus:border-sky-500"
                  />
                </div>

                <div>
                  <label htmlFor="client-cam-pass" className="block text-xs text-neutral-300 mb-1">
                    Contraseña de la Cámara / DVR *
                  </label>
                  <div className="relative">
                    <KeyRound className="w-3.5 h-3.5 text-neutral-500 absolute left-3 top-2.5" />
                    <input
                      id="client-cam-pass"
                      type="text"
                      value={password}
                      onChange={(e) => setPassword(e.target.value)}
                      placeholder="Contraseña del equipo"
                      className="w-full bg-neutral-950 border border-neutral-800 rounded-lg pl-8 pr-3 py-2 text-xs font-mono text-white focus:outline-none focus:border-sky-500"
                    />
                  </div>
                </div>

                <div>
                  <label htmlFor="client-cam-verif" className="block text-xs text-neutral-300 mb-1">
                    Código Verificación (Opcional)
                  </label>
                  <input
                    id="client-cam-verif"
                    type="text"
                    value={verificationCode}
                    onChange={(e) => setVerificationCode(e.target.value)}
                    placeholder="Código de la etiqueta del DVR"
                    className="w-full bg-neutral-950 border border-neutral-800 rounded-lg px-3 py-2 text-xs font-mono uppercase text-white focus:outline-none focus:border-sky-500"
                  />
                </div>
              </div>
            </div>

            {/* Step 3: Name & Location Identification */}
            <div className="space-y-3 pt-2 border-t border-neutral-800/80">
              <div className="text-xs font-semibold text-neutral-200 flex items-center gap-2">
                <span className="w-5 h-5 rounded-full bg-sky-500/20 border border-sky-500/40 text-sky-300 font-mono text-[11px] flex items-center justify-center">
                  3
                </span>
                <span>Identificación del Cliente y Ubicación</span>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label htmlFor="client-cam-prefix" className="block text-xs text-neutral-300 mb-1">
                    Nombre de la Cámara o Sucursal *
                  </label>
                  <input
                    id="client-cam-prefix"
                    type="text"
                    value={cameraNamePrefix}
                    onChange={(e) => setCameraNamePrefix(e.target.value)}
                    placeholder="Ej. Bodega Zona 12 / Entrada"
                    className="w-full bg-neutral-950 border border-neutral-800 rounded-lg px-3 py-2 text-xs text-white focus:outline-none focus:border-sky-500"
                  />
                </div>

                <div>
                  <label htmlFor="client-cam-clientname" className="block text-xs text-neutral-300 mb-1">
                    Nombre del Cliente / Empresa
                  </label>
                  <input
                    id="client-cam-clientname"
                    type="text"
                    value={clientName}
                    onChange={(e) => setClientName(e.target.value)}
                    placeholder="Ej. Ferretería El Constructor"
                    className="w-full bg-neutral-950 border border-neutral-800 rounded-lg px-3 py-2 text-xs text-white focus:outline-none focus:border-sky-500"
                  />
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                <div className="sm:col-span-2">
                  <label htmlFor="client-cam-loc" className="block text-xs text-neutral-300 mb-1">
                    Dirección o Área que vigila
                  </label>
                  <input
                    id="client-cam-loc"
                    type="text"
                    value={locationDesc}
                    onChange={(e) => setLocationDesc(e.target.value)}
                    placeholder="Ej. Portón Principal y Parqueo"
                    className="w-full bg-neutral-950 border border-neutral-800 rounded-lg px-3 py-2 text-xs text-white focus:outline-none focus:border-sky-500"
                  />
                </div>

                <div>
                  <label htmlFor="client-cam-streamtype" className="block text-xs text-neutral-300 mb-1">
                    Calidad de Transmisión
                  </label>
                  <select
                    id="client-cam-streamtype"
                    value={streamType}
                    onChange={(e) => setStreamType(e.target.value as 'main' | 'sub')}
                    className="w-full bg-neutral-950 border border-neutral-800 rounded-lg px-3 py-2 text-xs text-white focus:outline-none focus:border-sky-500"
                  >
                    <option value="main">1080p Principal (Alta Definición)</option>
                    <option value="sub">Sub-Stream (Rápido para 4G)</option>
                  </select>
                </div>
              </div>

              {channelsCount === 1 && (
                <div className="flex flex-wrap items-center justify-between gap-3 pt-1">
                  <div className="flex items-center gap-2">
                    <label htmlFor="client-cam-single-ch" className="text-xs text-neutral-400">
                      Número de Canal en el DVR:
                    </label>
                    <input
                      id="client-cam-single-ch"
                      type="number"
                      min={1}
                      max={64}
                      value={startChannel}
                      onChange={(e) => setStartChannel(Math.max(1, Number(e.target.value) || 1))}
                      className="w-16 bg-neutral-950 border border-neutral-800 rounded-lg px-2.5 py-1 text-xs font-mono text-white"
                    />
                  </div>

                  <label className="flex items-center gap-2 text-xs text-neutral-300 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={ptzSupported}
                      onChange={(e) => setPtzSupported(e.target.checked)}
                      className="rounded border-neutral-700 bg-neutral-950 text-sky-600"
                    />
                    <span>Cámara con movimiento PTZ (Giro / Zoom)</span>
                  </label>
                </div>
              )}
            </div>

            {formError && (
              <div className="p-3 rounded-xl bg-red-950/60 border border-red-800/80 text-xs text-red-300">
                {formError}
              </div>
            )}

            <button
              type="submit"
              className="w-full py-3 px-4 bg-sky-600 hover:bg-sky-500 active:bg-sky-700 text-white font-bold rounded-xl text-xs sm:text-sm flex items-center justify-center gap-2 shadow-lg shadow-sky-600/20 transition"
            >
              <Plus className="w-4 h-4" />
              <span>
                {channelsCount === 1
                  ? 'Agregar Cámara al Servidor Automáticamente'
                  : `Agregar ${channelsCount} Cámaras del DVR al Servidor Automáticamente`}
              </span>
            </button>
          </form>

          {/* Right 5 Cols: Automatic Server Provisioning & Live Preview */}
          <div className="lg:col-span-5 flex flex-col gap-4">
            {/* Automatic RTSP + MediaMTX Server Route Generator Box */}
            <div className="bg-neutral-900 border border-neutral-800 rounded-2xl p-5 space-y-4">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <Server className="w-4 h-4 text-emerald-400" />
                  <h3 className="text-sm font-bold text-white">
                    Previsualización de Inyección al Servidor
                  </h3>
                </div>
                <span className="text-[11px] font-mono text-emerald-400">
                  {previewCameras.length} {previewCameras.length === 1 ? 'canal listo' : 'canales listos'}
                </span>
              </div>

              <p className="text-xs text-neutral-400 leading-relaxed">
                Al presionar el botón, el sistema genera automáticamente las cadenas RTSP de tu equipo y las agrega al servidor de streaming (<code className="text-sky-300 font-mono">mediamtx.yml</code>) y a la base de datos en tiempo real:
              </p>

              <div className="space-y-2 max-h-60 overflow-y-auto pr-1">
                {previewCameras.slice(0, 8).map((pCam) => (
                  <div
                    key={pCam.channel}
                    className="bg-neutral-950 border border-neutral-800/90 rounded-xl p-2.5 text-[11px] space-y-1 font-mono"
                  >
                    <div className="flex items-center justify-between font-sans">
                      <span className="font-semibold text-white text-xs">{pCam.name}</span>
                      <span className="text-[10px] font-mono text-sky-400">
                        Ruta: /{getCameraMediaMtxPath(pCam)}
                      </span>
                    </div>
                    <div className="text-emerald-400 truncate">{maskRtspUrl(pCam.rtspUrl)}</div>
                  </div>
                ))}
                {previewCameras.length > 8 && (
                  <div className="text-center text-[11px] text-neutral-400 py-1">
                    + {previewCameras.length - 8} canales adicionales generados automáticamente
                  </div>
                )}
              </div>

              <div className="pt-3 border-t border-neutral-800 space-y-2 text-[11px] text-neutral-300">
                <div className="flex items-center gap-2">
                  <CheckCircle2 className="w-3.5 h-3.5 text-emerald-400 shrink-0" />
                  <span>Se guarda en <strong>Google Cloud Firestore</strong> al instante.</span>
                </div>
                <div className="flex items-center gap-2">
                  <Wifi className="w-3.5 h-3.5 text-sky-400 shrink-0" />
                  <span>Se agrega automáticamente al archivo <code className="font-mono text-sky-300">mediamtx.yml</code> del servidor.</span>
                </div>
                <div className="flex items-center gap-2">
                  <ShieldCheck className="w-3.5 h-3.5 text-emerald-400 shrink-0" />
                  <span>Aparece directo en el <strong>Muro de Video</strong> y <strong>Mapa Táctico 2D</strong>.</span>
                </div>
              </div>
            </div>

            {/* Confirmation Banner when Client Submits Cameras */}
            {lastSubmittedCameras.length > 0 && (
              <div className="bg-emerald-950/50 border border-emerald-500/40 rounded-2xl p-5 space-y-3 shadow-lg">
                <div className="flex items-center gap-2 text-emerald-300 font-bold text-sm">
                  <CheckCircle2 className="w-5 h-5 text-emerald-400 shrink-0" />
                  <span>
                    ¡{lastSubmittedCameras.length}{' '}
                    {lastSubmittedCameras.length === 1 ? 'Cámara Agregada' : 'Cámaras Agregadas'} al Servidor con Éxito!
                  </span>
                </div>
                <p className="text-xs text-neutral-200 leading-relaxed">
                  Las cámaras de <strong>{clientName}</strong> ({host}:{port}) ya fueron registradas en la nube y añadidas a la configuración del servidor.
                </p>

                <div className="flex flex-wrap items-center gap-2 pt-1">
                  {onSelectCameraInMonitor && lastSubmittedCameras[0] && (
                    <button
                      type="button"
                      onClick={() => onSelectCameraInMonitor(lastSubmittedCameras[0].id)}
                      className="px-3 py-1.5 bg-emerald-600 hover:bg-emerald-500 text-white rounded-lg text-xs font-semibold flex items-center gap-1.5 transition"
                    >
                      <Eye className="w-3.5 h-3.5" />
                      <span>Ver Cámara en Monitor en Vivo</span>
                    </button>
                  )}

                  {onNavigateToYaml && !isStandaloneClientMode && (
                    <button
                      type="button"
                      onClick={onNavigateToYaml}
                      className="px-3 py-1.5 bg-neutral-900 hover:bg-neutral-800 text-neutral-200 border border-neutral-700 rounded-lg text-xs font-medium flex items-center gap-1.5 transition"
                    >
                      <FileCode className="w-3.5 h-3.5 text-sky-400" />
                      <span>Ver en Servidor mediamtx.yml</span>
                    </button>
                  )}
                </div>
              </div>
            )}

            {/* Server Queue of Registered Cameras */}
            <div className="bg-neutral-900 border border-neutral-800 rounded-2xl p-5 space-y-3">
              <div className="flex items-center justify-between">
                <span className="text-xs font-bold text-white flex items-center gap-1.5">
                  <Layers className="w-4 h-4 text-sky-400" />
                  Cámaras Activas en el Servidor ({cameras.length})
                </span>
                <span className="text-[11px] font-mono text-neutral-400">
                  Sincronizadas en Vivo
                </span>
              </div>

              <div className="space-y-1.5 max-h-48 overflow-y-auto pr-1">
                {cameras.slice(0, 8).map((cam) => (
                  <div
                    key={cam.id}
                    className="flex items-center justify-between bg-neutral-950 border border-neutral-800/80 rounded-lg px-3 py-2 text-xs"
                  >
                    <div className="min-w-0 pr-2">
                      <div className="font-semibold text-white truncate">{cam.name}</div>
                      <div className="text-[10px] font-mono text-neutral-400 truncate">
                        {cam.host}:{cam.port} · CH{cam.channel}
                      </div>
                    </div>
                    <span className="text-[10px] font-mono text-emerald-400 shrink-0">
                      En Servidor
                    </span>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};
