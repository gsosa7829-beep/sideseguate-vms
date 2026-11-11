import React, { useState, useRef, useEffect } from 'react';
import { Camera, Project } from '../lib/types';
import {
  ParsedCameraSetupIntent,
  ChannelProbeResult,
  LiveDeviceDiagItem,
  GuidedConnectionMode,
  GuidedCameraSetupInput,
  probeAndDiscoverChannels,
  buildCamerasFromWizard,
  processConversationWithAi,
  validateGuidedCameraInput,
  buildIntentFromGuidedForm,
} from '../lib/aiCameraWizard';
import { maskRtspUrl } from '../lib/rtspHelper';
import {
  Bot,
  Sparkles,
  Send,
  X,
  CheckCircle2,
  Loader2,
  Tv,
  Terminal,
  Copy,
  Check,
  Eye,
  PlusCircle,
  Zap,
  Activity,
  Wifi,
  Signal,
  AlertCircle,
} from 'lucide-react';

interface ChatMessage {
  id: string;
  sender: 'bot' | 'user';
  text: string;
  timestamp: string;
  showModeLauncher?: boolean;
  guidedMode?: GuidedConnectionMode;
  guidedCompleted?: boolean;
  intent?: ParsedCameraSetupIntent;
  probedChannels?: ChannelProbeResult[];
  addedCameras?: Camera[];
  diagnostics?: LiveDeviceDiagItem[];
  isProbing?: boolean;
  probeStepText?: string;
}

interface AiCameraSetupAssistantProps {
  isOpen: boolean;
  onClose: () => void;
  projects: Project[];
  cameras: Camera[];
  onAddCamerasBatch: (newCameras: Camera[], clientName: string) => void;
  onSelectCameraAndGoToWall: (cameraId: string) => void;
}

const GUIDED_MODE_META: Record<
  GuidedConnectionMode,
  {
    title: string;
    shortLabel: string;
    description: string;
    borderClass: string;
    badgeClass: string;
    buttonClass: string;
    showLocalFields: boolean;
    showRemoteFields: boolean;
  }
> = {
  local: {
    title: 'Misma Red Local (Cable / Wi-Fi)',
    shortLabel: 'Misma Red',
    description: 'Estás en el mismo router o red del DVR. Solo pide IP local, usuario y clave.',
    borderClass: 'border-sky-500/40 bg-sky-950/15',
    badgeClass: 'bg-sky-500/15 text-sky-300 border-sky-500/30',
    buttonClass: 'bg-sky-600 hover:bg-sky-500',
    showLocalFields: true,
    showRemoteFields: false,
  },
  remote: {
    title: 'Estoy Lejos / Cámara 4G (Nube P2P)',
    shortLabel: 'Lejos / 4G',
    description: 'Estás a distancia o es cámara con chip celular. Solo pide Serie y Código.',
    borderClass: 'border-emerald-500/40 bg-emerald-950/15',
    badgeClass: 'bg-emerald-500/15 text-emerald-300 border-emerald-500/30',
    buttonClass: 'bg-emerald-600 hover:bg-emerald-500',
    showLocalFields: false,
    showRemoteFields: true,
  },
  hybrid: {
    title: 'Híbrido (Red Local + Remoto 4G/Nube)',
    shortLabel: 'Híbrido (Ambos)',
    description: 'IP local sin lag en el negocio y acceso desde el celular fuera de la red.',
    borderClass: 'border-amber-500/40 bg-amber-950/15',
    badgeClass: 'bg-amber-500/15 text-amber-300 border-amber-500/30',
    buttonClass: 'bg-amber-600 hover:bg-amber-500',
    showLocalFields: true,
    showRemoteFields: true,
  },
};

const MODE_ORDER: GuidedConnectionMode[] = ['local', 'remote', 'hybrid'];

function ModeIcon({ mode, className = 'w-4 h-4' }: { mode: GuidedConnectionMode; className?: string }) {
  if (mode === 'local') return <Wifi className={className} />;
  if (mode === 'remote') return <Signal className={className} />;
  return <Zap className={className} />;
}

interface GuidedCameraSetupCardProps {
  initialMode: GuidedConnectionMode;
  disabled: boolean;
  onSubmit: (input: GuidedCameraSetupInput) => void;
}

/**
 * Tarjeta interactiva con recuadros etiquetados según la ubicación del usuario
 * (Misma Red Local, Lejos/4G o Híbrido) para evitar dudas al registrar equipos.
 */
const GuidedCameraSetupCard: React.FC<GuidedCameraSetupCardProps> = ({
  initialMode,
  disabled,
  onSubmit,
}) => {
  const [form, setForm] = useState<GuidedCameraSetupInput>({
    mode: initialMode,
    brand: initialMode === 'remote' ? 'hikvision_ip' : 'hikvision_dvr',
    cameraName: '',
    host: '',
    port: 554,
    username: 'admin',
    password: '',
    deviceSerial: '',
    verificationCode: '',
    channelsCount: initialMode === 'remote' ? 1 : 4,
  });
  const [validationError, setValidationError] = useState<string | null>(null);

  const meta = GUIDED_MODE_META[form.mode];

  const handleModeSwitch = (nextMode: GuidedConnectionMode) => {
    setValidationError(null);
    setForm((prev) => ({
      ...prev,
      mode: nextMode,
      brand: nextMode === 'remote' ? 'hikvision_ip' : prev.brand,
      channelsCount: nextMode === 'remote' ? 1 : prev.channelsCount === 1 && prev.brand === 'hikvision_dvr' ? 4 : prev.channelsCount,
    }));
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const err = validateGuidedCameraInput(form);
    if (err) {
      setValidationError(err);
      return;
    }
    setValidationError(null);
    onSubmit(form);
  };

  const inputBaseClass =
    'w-full min-w-0 bg-neutral-900 border border-neutral-700 focus:border-sky-500 rounded-lg px-3 py-2 text-xs text-white placeholder-neutral-500 focus:outline-none transition-colors';

  return (
    <form
      onSubmit={handleSubmit}
      className={`mt-3 p-3 sm:p-3.5 rounded-xl border ${meta.borderClass} space-y-3 min-w-0 max-w-full`}
    >
      {/* Cabecera + selector rápido de escenario */}
      <div className="flex flex-wrap items-center justify-between gap-2 pb-2 border-b border-neutral-800/80 min-w-0">
        <div className="flex items-center gap-2 min-w-0 flex-1">
          <span className={`px-2 py-0.5 rounded-md border text-[10px] font-semibold flex items-center gap-1 shrink-0 ${meta.badgeClass}`}>
            <ModeIcon mode={form.mode} className="w-3 h-3" />
            {meta.shortLabel}
          </span>
          <span className="hidden sm:inline text-xs font-semibold text-white truncate">{meta.title}</span>
        </div>

        <div className="flex flex-wrap items-center gap-1 bg-neutral-950/80 p-0.5 rounded-lg border border-neutral-800 shrink-0">
          {MODE_ORDER.map((m) => (
            <button
              key={m}
              type="button"
              disabled={disabled}
              onClick={() => handleModeSwitch(m)}
              className={`px-2 py-1 rounded-md text-[10px] font-medium transition cursor-pointer ${
                form.mode === m
                  ? 'bg-neutral-800 text-white shadow-xs'
                  : 'text-neutral-400 hover:text-neutral-200'
              }`}
            >
              {GUIDED_MODE_META[m].shortLabel}
            </button>
          ))}
        </div>
      </div>

      <p className="text-[11px] text-neutral-400 leading-snug">{meta.description}</p>

      {/* Campos de Red Local (Misma Red o Híbrido) */}
      {meta.showLocalFields && (
        <div className="space-y-2.5">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
            <div>
              <label className="block text-[11px] font-semibold text-neutral-300 mb-1">
                Marca del Equipo
              </label>
              <select
                value={form.brand}
                disabled={disabled}
                onChange={(e) => {
                  const brand = e.target.value as ParsedCameraSetupIntent['brand'];
                  setForm((prev) => ({
                    ...prev,
                    brand,
                    channelsCount: brand === 'hikvision_ip' || brand === 'generic_rtsp' ? 1 : prev.channelsCount || 4,
                  }));
                }}
                className={inputBaseClass}
              >
                <option value="hikvision_dvr">DVR Hikvision / HiLook</option>
                <option value="dahua_dvr">Dahua XVR / Imou</option>
                <option value="hikvision_ip">Cámara IP / 4G Hikvision</option>
                <option value="generic_rtsp">Cámara RTSP / ONVIF Genérica</option>
              </select>
            </div>

            <div>
              <label className="block text-[11px] font-semibold text-neutral-300 mb-1">
                Canales del Equipo
              </label>
              <select
                value={form.channelsCount}
                disabled={disabled}
                onChange={(e) => setForm((prev) => ({ ...prev, channelsCount: Number(e.target.value) }))}
                className={inputBaseClass}
              >
                <option value={1}>1 Canal (Cámara única)</option>
                <option value={2}>2 Canales</option>
                <option value={4}>4 Canales (DVR estándar)</option>
                <option value={8}>8 Canales</option>
                <option value={16}>16 Canales</option>
              </select>
            </div>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-3 gap-2.5">
            <div className="sm:col-span-1">
              <label className="block text-[11px] font-semibold text-sky-300 mb-1">
                Dirección IP Local *
              </label>
              <input
                type="text"
                disabled={disabled}
                value={form.host}
                onChange={(e) => setForm((prev) => ({ ...prev, host: e.target.value }))}
                placeholder="192.168.1.115"
                className={`${inputBaseClass} font-mono`}
              />
            </div>

            <div>
              <label className="block text-[11px] font-semibold text-neutral-300 mb-1">
                Usuario *
              </label>
              <input
                type="text"
                disabled={disabled}
                value={form.username}
                onChange={(e) => setForm((prev) => ({ ...prev, username: e.target.value }))}
                placeholder="admin"
                className={`${inputBaseClass} font-mono`}
              />
            </div>

            <div>
              <label className="block text-[11px] font-semibold text-amber-300 mb-1">
                Contraseña del DVR *
              </label>
              <input
                type="text"
                disabled={disabled}
                value={form.password}
                onChange={(e) => setForm((prev) => ({ ...prev, password: e.target.value }))}
                placeholder="Clave local"
                className={`${inputBaseClass} font-mono`}
              />
            </div>
          </div>
        </div>
      )}

      {/* Campos Remotos / Nube P2P (Lejos 4G o Híbrido) */}
      {meta.showRemoteFields && (
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
          <div>
            <label className="block text-[11px] font-semibold text-emerald-300 mb-1">
              Número de Serie (SN) *
            </label>
            <input
              type="text"
              disabled={disabled}
              value={form.deviceSerial}
              onChange={(e) => setForm((prev) => ({ ...prev, deviceSerial: e.target.value.toUpperCase() }))}
              placeholder="Ej. FF9363192"
              className={`${inputBaseClass} font-mono uppercase`}
            />
          </div>

          <div>
            <label className="block text-[11px] font-semibold text-amber-300 mb-1">
              Código de Verificación *
            </label>
            <input
              type="text"
              disabled={disabled}
              value={form.verificationCode}
              onChange={(e) => setForm((prev) => ({ ...prev, verificationCode: e.target.value.toUpperCase() }))}
              placeholder="Ej. WZRIKO"
              className={`${inputBaseClass} font-mono uppercase`}
            />
          </div>
        </div>
      )}

      {/* Nombre / Proyecto (común a los 3 modos, opcional en remoto) */}
      <div>
        <label className="block text-[11px] font-semibold text-neutral-300 mb-1">
          Nombre o Proyecto {form.mode === 'remote' ? '(Opcional: lo toma de la nube si se deja vacío)' : '(Opcional)'}
        </label>
        <input
          type="text"
          disabled={disabled}
          value={form.cameraName}
          onChange={(e) => setForm((prev) => ({ ...prev, cameraName: e.target.value }))}
          placeholder={
            form.mode === 'remote'
              ? 'Ej. Calle Iglesia Tabernáculo (o déjalo vacío)'
              : 'Ej. Bodega Central o Portón Norte'
          }
          className={inputBaseClass}
        />
      </div>

      {validationError && (
        <div className="flex items-center gap-2 text-[11px] text-amber-300 bg-amber-950/50 border border-amber-500/30 rounded-lg px-3 py-2">
          <AlertCircle className="w-3.5 h-3.5 shrink-0" />
          <span>{validationError}</span>
        </div>
      )}

      <button
        type="submit"
        disabled={disabled}
        className={`w-full py-2.5 px-4 rounded-xl ${meta.buttonClass} disabled:opacity-50 text-white font-bold text-xs shadow-md flex items-center justify-center gap-2 transition cursor-pointer`}
      >
        <PlusCircle className="w-4 h-4" />
        <span>Conectar y Verificar</span>
      </button>
    </form>
  );
};

export const AiCameraSetupAssistant: React.FC<AiCameraSetupAssistantProps> = ({
  isOpen,
  onClose,
  projects,
  cameras,
  onAddCamerasBatch,
  onSelectCameraAndGoToWall,
}) => {
  const [inputText, setInputText] = useState<string>('');
  const [isProcessing, setIsProcessing] = useState<boolean>(false);
  const [copiedUrlId, setCopiedUrlId] = useState<string | null>(null);
  const [partialContext, setPartialContext] = useState<string>('');

  const [messages, setMessages] = useState<ChatMessage[]>(() => [
    {
      id: 'welcome-msg',
      sender: 'bot',
      text: '¡Hola! Soy tu Asistente de Cámaras. Elige dónde te encuentras para mostrarte exactamente los recuadros que necesitas, o escríbeme directamente abajo:',
      timestamp: new Date().toLocaleTimeString('es-GT', { hour: '2-digit', minute: '2-digit' }),
      showModeLauncher: true,
    },
  ]);

  const chatEndRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (isOpen) {
      setTimeout(() => {
        chatEndRef.current?.scrollIntoView({ behavior: 'smooth' });
      }, 100);
    }
  }, [messages, isOpen]);

  if (!isOpen) return null;

  const handleCopyUrl = (url: string, id: string) => {
    navigator.clipboard.writeText(url);
    setCopiedUrlId(id);
    setTimeout(() => setCopiedUrlId(null), 2000);
  };

  /**
   * Flujo único de verificación de canales e incorporación al Muro de Video
   * compartido entre los recuadros guiados y el chat libre de IA.
   */
  const executeSetupIntent = async (
    intent: ParsedCameraSetupIntent,
    thinkingMsgId: string,
    customReplyText?: string
  ) => {
    setMessages((prev) =>
      prev.map((m) =>
        m.id === thinkingMsgId
          ? {
              ...m,
              text: `Analizando **${intent.brandLabel}** (${
                intent.deviceSerial ? `Serie ${intent.deviceSerial}` : `${intent.host}:${intent.port}`
              })...`,
              probeStepText: intent.deviceSerial
                ? `Consultando nube P2P para serie ${intent.deviceSerial}...`
                : `Escaneando ${intent.channelsCount} ${
                    intent.channelsCount === 1 ? 'canal' : 'canales'
                  } en puerto ${intent.port}...`,
            }
          : m
      )
    );

    const probed = await probeAndDiscoverChannels(intent);
    const generatedCameras = buildCamerasFromWizard(intent, probed, projects);
    const targetProj = projects.find((p) => p.id === generatedCameras[0]?.projectId);

    onAddCamerasBatch(
      generatedCameras,
      targetProj?.clientName || probed[0]?.detectedDeviceName || intent.cameraNamePrefix || 'Asistente de Cámaras'
    );

    const activeCount = probed.filter((c) => c.active).length;

    setMessages((prev) =>
      prev.map((m) =>
        m.id === thinkingMsgId
          ? {
              ...m,
              isProbing: false,
              text:
                customReplyText ||
                `¡Listo! Conecté **${generatedCameras[0]?.name || intent.brandLabel}** (${
                  intent.deviceSerial ? `Serie ${intent.deviceSerial}` : `${intent.host}:${intent.port}`
                }), verifiqué **${activeCount} ${
                  activeCount === 1 ? 'canal activo' : 'canales activos'
                }** y la agregué al **Muro de Video**.`,
              intent,
              probedChannels: probed,
              addedCameras: generatedCameras,
            }
          : m
      )
    );
  };

  const handleOpenGuidedCard = (mode: GuidedConnectionMode) => {
    if (isProcessing) return;
    const nowTime = new Date().toLocaleTimeString('es-GT', { hour: '2-digit', minute: '2-digit' });
    const meta = GUIDED_MODE_META[mode];

    setMessages((prev) => [
      ...prev,
      {
        id: `user-mode-${Date.now()}`,
        sender: 'user',
        text: `Quiero agregar un equipo (${meta.shortLabel})`,
        timestamp: nowTime,
      },
      {
        id: `bot-form-${Date.now() + 1}`,
        sender: 'bot',
        text: `Perfecto. Completa estos recuadros para **${meta.title}**:`,
        timestamp: nowTime,
        guidedMode: mode,
        guidedCompleted: false,
      },
    ]);
  };

  const handleGuidedCardSubmit = async (formMessageId: string, input: GuidedCameraSetupInput) => {
    if (isProcessing) return;
    const nowTime = new Date().toLocaleTimeString('es-GT', { hour: '2-digit', minute: '2-digit' });
    const intent = buildIntentFromGuidedForm(input);
    const thinkingMsgId = `bot-think-${Date.now()}`;

    const summaryUserText =
      input.mode === 'remote'
        ? `Serie: ${intent.deviceSerial} · Código: ${intent.verificationCode}${
            input.cameraName.trim() ? ` · Nombre: ${input.cameraName.trim()}` : ''
          }`
        : `IP: ${intent.host} · Usuario: ${intent.username} · Canales: ${intent.channelsCount}${
            intent.deviceSerial ? ` · Serie: ${intent.deviceSerial}` : ''
          }`;

    setIsProcessing(true);
    setMessages((prev) => [
      ...prev.map((m) => (m.id === formMessageId ? { ...m, guidedCompleted: true } : m)),
      {
        id: `user-submit-${Date.now()}`,
        sender: 'user',
        text: summaryUserText,
        timestamp: nowTime,
      },
      {
        id: thinkingMsgId,
        sender: 'bot',
        text: 'Verificando credenciales y canales...',
        timestamp: nowTime,
        isProbing: true,
        probeStepText: intent.deviceSerial
          ? `Consultando nube P2P para serie ${intent.deviceSerial}...`
          : `Validando configuración de red ${intent.host}:${intent.port}...`,
      },
    ]);

    try {
      await executeSetupIntent(intent, thinkingMsgId);
    } finally {
      setIsProcessing(false);
    }
  };

  const processUserPrompt = async (rawPrompt: string) => {
    const trimmed = rawPrompt.trim();
    if (!trimmed || isProcessing) return;

    const nowTime = new Date().toLocaleTimeString('es-GT', { hour: '2-digit', minute: '2-digit' });
    const userMsg: ChatMessage = {
      id: `user-${Date.now()}`,
      sender: 'user',
      text: trimmed,
      timestamp: nowTime,
    };

    const thinkingMsgId = `bot-think-${Date.now()}`;
    const initialBotMsg: ChatMessage = {
      id: thinkingMsgId,
      sender: 'bot',
      text: 'Analizando solicitud y verificando equipos en tiempo real...',
      timestamp: nowTime,
      isProbing: true,
      probeStepText: 'Verificando estado de red y canales...',
    };

    setInputText('');
    setIsProcessing(true);
    setMessages((prev) => [...prev, userMsg, initialBotMsg]);

    const aiTurn = await processConversationWithAi(trimmed, {
      cameras,
      projects,
      partialContext,
      history: messages.map((m) => ({ sender: m.sender, text: m.text })),
    });

    if (aiTurn.mode === 'ask_missing_host') {
      setPartialContext(partialContext ? `${partialContext} ${trimmed}` : trimmed);
      setMessages((prev) =>
        prev.map((m) =>
          m.id === thinkingMsgId
            ? {
                ...m,
                isProbing: false,
                text: aiTurn.replyText,
                showModeLauncher: true,
              }
            : m
        )
      );
      setIsProcessing(false);
      return;
    }

    if (aiTurn.mode === 'setup_camera' && aiTurn.intent) {
      setPartialContext('');
      await executeSetupIntent(aiTurn.intent, thinkingMsgId, aiTurn.replyText);
      setIsProcessing(false);
      return;
    }

    setPartialContext('');
    setMessages((prev) =>
      prev.map((m) =>
        m.id === thinkingMsgId
          ? {
              ...m,
              isProbing: false,
              text: aiTurn.replyText,
              diagnostics: aiTurn.diagnostics,
            }
          : m
      )
    );
    setIsProcessing(false);
  };

  const handleFormSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    processUserPrompt(inputText);
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-end bg-black/70 backdrop-blur-sm animate-fadeIn">
      <div className="relative w-full max-w-xl h-full max-h-dvh bg-neutral-950 border-l border-sky-500/30 shadow-2xl flex flex-col overflow-hidden">
        {/* Header limpio */}
        <div className="px-4 sm:px-5 py-3.5 sm:py-4 bg-gradient-to-r from-sky-950/80 via-neutral-900 to-neutral-950 border-b border-neutral-800 flex items-center justify-between gap-2.5 shrink-0 min-w-0">
          <div className="flex items-center gap-3 min-w-0 flex-1">
            <div className="w-10 h-10 rounded-xl bg-sky-500/20 border border-sky-400/40 flex items-center justify-center text-sky-400 shrink-0">
              <Bot className="w-5 h-5" />
            </div>
            <div className="min-w-0 flex-1">
              <div className="flex items-center gap-2 flex-wrap">
                <h2 className="text-base font-bold text-white tracking-tight truncate">
                  Asistente de Cámaras
                </h2>
                <span className="px-2 py-0.5 text-[10px] font-semibold bg-emerald-500/20 text-emerald-300 border border-emerald-500/30 rounded-full flex items-center gap-1 shrink-0">
                  <Sparkles className="w-3 h-3" /> Activo
                </span>
              </div>
              <p className="text-xs text-neutral-400 truncate">
                Configuración guiada (Local, Lejos 4G, Híbrido) y diagnóstico
              </p>
            </div>
          </div>

          <button
            onClick={onClose}
            className="p-2 rounded-lg text-neutral-400 hover:text-white hover:bg-neutral-800/80 transition-colors shrink-0 cursor-pointer"
            title="Cerrar"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Historial de Conversación */}
        <div className="flex-1 overflow-y-auto overflow-x-hidden p-3.5 sm:p-5 space-y-4 min-w-0">
          {messages.map((msg) => (
            <div
              key={msg.id}
              className={`flex flex-col min-w-0 ${
                msg.sender === 'user' ? 'items-end' : 'items-start'
              }`}
            >
              <div
                className={`rounded-2xl px-3.5 sm:px-4 py-3 text-sm leading-relaxed min-w-0 break-words ${
                  msg.sender === 'user'
                    ? 'max-w-[90%] bg-sky-600 text-white rounded-br-xs shadow-md'
                    : 'w-full max-w-full sm:max-w-[94%] bg-neutral-900/95 border border-neutral-800 text-neutral-200 rounded-bl-xs shadow-lg'
                }`}
              >
                <div className="flex items-center justify-between gap-4 mb-1 text-[11px] opacity-70">
                  <span className="font-semibold flex items-center gap-1">
                    {msg.sender === 'bot' ? (
                      <>
                        <Sparkles className="w-3 h-3 text-sky-400" />
                        Asistente de Cámaras
                      </>
                    ) : (
                      'Tú'
                    )}
                  </span>
                  <span>{msg.timestamp}</span>
                </div>

                <p className="whitespace-pre-line">{msg.text.replace(/\*\*/g, '')}</p>

                {/* Selector de 3 Escenarios (Misma Red / Lejos 4G / Híbrido) */}
                {msg.showModeLauncher && (
                  <div className="mt-3 grid grid-cols-1 gap-2">
                    {MODE_ORDER.map((mode) => {
                      const meta = GUIDED_MODE_META[mode];
                      return (
                        <button
                          key={mode}
                          type="button"
                          disabled={isProcessing}
                          onClick={() => handleOpenGuidedCard(mode)}
                          className={`text-left p-3 rounded-xl border ${meta.borderClass} hover:brightness-110 transition-all flex items-start gap-3 cursor-pointer disabled:opacity-50`}
                        >
                          <div className={`w-8 h-8 rounded-lg border flex items-center justify-center shrink-0 ${meta.badgeClass}`}>
                            <ModeIcon mode={mode} className="w-4 h-4" />
                          </div>
                          <div className="min-w-0 flex-1">
                            <div className="text-xs font-bold text-white flex items-center justify-between gap-2">
                              <span>{meta.title}</span>
                              <span className="text-[10px] font-mono opacity-80">Elegir →</span>
                            </div>
                            <p className="text-[11px] text-neutral-400 mt-0.5 leading-snug">
                              {meta.description}
                            </p>
                          </div>
                        </button>
                      );
                    })}
                  </div>
                )}

                {/* Recuadros Interactivos Guiados */}
                {msg.guidedMode && !msg.guidedCompleted && (
                  <GuidedCameraSetupCard
                    initialMode={msg.guidedMode}
                    disabled={isProcessing}
                    onSubmit={(input) => handleGuidedCardSubmit(msg.id, input)}
                  />
                )}

                {msg.guidedMode && msg.guidedCompleted && (
                  <div className="mt-2 text-[11px] text-emerald-400 font-medium flex items-center gap-1.5">
                    <CheckCircle2 className="w-3.5 h-3.5" />
                    Datos enviados al verificador
                  </div>
                )}

                {msg.isProbing && (
                  <div className="mt-3 p-3 rounded-xl bg-neutral-950 border border-sky-500/30 flex items-center gap-3 text-xs text-sky-300">
                    <Loader2 className="w-4 h-4 animate-spin shrink-0 text-sky-400" />
                    <span>{msg.probeStepText}</span>
                  </div>
                )}

                {/* Tarjeta de Diagnóstico en Vivo */}
                {!msg.isProbing && msg.diagnostics && msg.diagnostics.length > 0 && (
                  <div className="mt-3 p-3 rounded-xl bg-neutral-950 border border-neutral-800 space-y-2">
                    <div className="flex items-center justify-between text-xs font-semibold text-sky-400 border-b border-neutral-800 pb-1.5">
                      <span className="flex items-center gap-1.5">
                        <Activity className="w-3.5 h-3.5 text-emerald-400" /> Estado de Cámaras en Vivo
                      </span>
                      <span className="text-[10px] text-neutral-400 font-mono">
                        {msg.diagnostics.filter((d) => d.online).length}/{msg.diagnostics.length} EN LÍNEA
                      </span>
                    </div>
                    <div className="space-y-1.5">
                      {msg.diagnostics.map((d, idx) => (
                        <div
                          key={`${d.serial}-${d.channel}-${idx}`}
                          className="p-2.5 rounded-lg bg-neutral-900/90 border border-neutral-800 flex flex-col sm:flex-row sm:items-center justify-between gap-1.5 text-xs"
                        >
                          <div>
                            <div className="font-semibold text-white flex items-center gap-1.5">
                              <span
                                className={`w-2 h-2 rounded-full ${
                                  d.online ? 'bg-emerald-400 animate-pulse' : 'bg-red-500'
                                }`}
                              />
                              {d.cameraName}
                            </div>
                            <div className="text-[11px] text-neutral-400 font-mono">
                              Serie: {d.serial} · CH{d.channel} · {d.codec}
                            </div>
                          </div>
                          <div>
                            <span
                              className={`inline-block px-2 py-0.5 rounded text-[10px] font-semibold ${
                                d.online
                                  ? 'bg-emerald-500/15 text-emerald-300 border border-emerald-500/30'
                                  : 'bg-red-500/15 text-red-300 border border-red-500/30'
                              }`}
                            >
                              {d.statusMessage}
                            </span>
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                {/* Tarjeta de Canales Configurados */}
                {!msg.isProbing && msg.intent && msg.probedChannels && (
                  <div className="mt-3 space-y-3">
                    <div className="p-3 rounded-xl bg-neutral-950/90 border border-neutral-800 space-y-2">
                      <div className="flex items-center justify-between text-xs font-semibold text-sky-400 border-b border-neutral-800 pb-1.5">
                        <span className="flex items-center gap-1.5">
                          <Terminal className="w-3.5 h-3.5" /> Equipo Detectado
                        </span>
                        <span className="px-2 py-0.5 rounded bg-emerald-500/15 text-emerald-400 border border-emerald-500/30 text-[10px]">
                          Puerto {msg.intent.port} · {msg.intent.codec}
                        </span>
                      </div>

                      <div className="grid grid-cols-2 sm:grid-cols-3 gap-2 text-[11px]">
                        <div className="bg-neutral-900/80 p-2 rounded-lg border border-neutral-800/80">
                          <span className="text-neutral-400 block">Equipo:</span>
                          <span className="text-white font-medium">{msg.intent.brandLabel}</span>
                        </div>
                        <div className="bg-neutral-900/80 p-2 rounded-lg border border-neutral-800/80">
                          <span className="text-neutral-400 block">
                            {msg.intent.deviceSerial ? 'Serie / Enlace:' : 'IP / Host:'}
                          </span>
                          <span className="text-emerald-300 font-mono truncate block">
                            {msg.intent.deviceSerial
                              ? `${msg.intent.deviceSerial} (P2P)`
                              : `${msg.intent.host}:${msg.intent.port}`}
                          </span>
                        </div>
                        <div className="bg-neutral-900/80 p-2 rounded-lg border border-neutral-800/80">
                          <span className="text-neutral-400 block">Acceso:</span>
                          <span className="text-amber-300 font-mono">
                            {msg.intent.username} /{' '}
                            {msg.intent.verificationCode || msg.intent.password || '••••'}
                          </span>
                        </div>
                      </div>
                    </div>

                    <div className="space-y-2">
                      <div className="text-xs font-semibold text-neutral-300 flex items-center justify-between">
                        <span className="flex items-center gap-1.5">
                          <Tv className="w-3.5 h-3.5 text-emerald-400" /> Canales ({msg.probedChannels.length})
                        </span>
                        <span className="text-[11px] text-emerald-400 font-normal flex items-center gap-1">
                          <CheckCircle2 className="w-3.5 h-3.5" /> Listos en el Muro
                        </span>
                      </div>

                      <div className="space-y-1.5 max-h-56 overflow-y-auto pr-1">
                        {msg.probedChannels.map((ch) => {
                          const copyIdMain = `${msg.id}-ch${ch.channel}-main`;
                          const copyIdSub = `${msg.id}-ch${ch.channel}-sub`;
                          return (
                            <div
                              key={ch.channel}
                              className="p-2.5 rounded-xl bg-neutral-950 border border-neutral-800 text-xs space-y-1.5"
                            >
                              <div className="flex items-center justify-between gap-2">
                                <span className="font-bold text-white flex items-center gap-1.5 truncate">
                                  <span className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse shrink-0" />
                                  Canal {ch.channel} ({ch.channelCodeMain} / {ch.channelCodeSub})
                                </span>
                                <span className="text-[10px] text-emerald-400 bg-emerald-950/60 px-2 py-0.5 rounded border border-emerald-500/30 shrink-0 truncate max-w-[180px]">
                                  {ch.statusText || 'Activo'}
                                </span>
                              </div>

                              <div className="flex items-center justify-between gap-2 bg-neutral-900/90 px-2.5 py-1 rounded border border-neutral-800 font-mono text-[11px]">
                                <span className="truncate text-neutral-300">
                                  <strong className="text-sky-400">HD {ch.channelCodeMain}:</strong>{' '}
                                  {maskRtspUrl(ch.rtspUrlMain)}
                                </span>
                                <button
                                  type="button"
                                  onClick={() => handleCopyUrl(ch.rtspUrlMain, copyIdMain)}
                                  className="text-neutral-400 hover:text-white shrink-0"
                                  title="Copiar RTSP Principal"
                                >
                                  {copiedUrlId === copyIdMain ? (
                                    <Check className="w-3.5 h-3.5 text-emerald-400" />
                                  ) : (
                                    <Copy className="w-3.5 h-3.5" />
                                  )}
                                </button>
                              </div>

                              <div className="flex items-center justify-between gap-2 bg-neutral-900/90 px-2.5 py-1 rounded border border-neutral-800 font-mono text-[11px]">
                                <span className="truncate text-neutral-400">
                                  <strong className="text-amber-400">Sub {ch.channelCodeSub}:</strong>{' '}
                                  {maskRtspUrl(ch.rtspUrlSub)}
                                </span>
                                <button
                                  type="button"
                                  onClick={() => handleCopyUrl(ch.rtspUrlSub, copyIdSub)}
                                  className="text-neutral-400 hover:text-white shrink-0"
                                  title="Copiar RTSP Sub-stream"
                                >
                                  {copiedUrlId === copyIdSub ? (
                                    <Check className="w-3.5 h-3.5 text-emerald-400" />
                                  ) : (
                                    <Copy className="w-3.5 h-3.5" />
                                  )}
                                </button>
                              </div>
                            </div>
                          );
                        })}
                      </div>
                    </div>

                    {msg.addedCameras && msg.addedCameras.length > 0 && (
                      <button
                        type="button"
                        onClick={() => {
                          onSelectCameraAndGoToWall(msg.addedCameras![0].id);
                          onClose();
                        }}
                        className="w-full py-2.5 px-4 rounded-xl bg-gradient-to-r from-emerald-600 to-sky-600 hover:from-emerald-500 hover:to-sky-500 text-white font-bold text-xs shadow-lg flex items-center justify-center gap-2 transition-all cursor-pointer"
                      >
                        <Eye className="w-4 h-4" />
                        Ver en el Muro de Video
                      </button>
                    )}
                  </div>
                )}
              </div>
            </div>
          ))}
          <div ref={chatEndRef} />
        </div>

        {/* Barra rápida: 3 Escenarios Guiados + Diagnóstico en Vivo */}
        <div className="px-3.5 sm:px-5 py-2.5 bg-neutral-900/60 border-t border-neutral-800/80 space-y-2 shrink-0 min-w-0">
          <div className="flex items-center justify-between text-[11px] text-neutral-400 font-medium">
            <span>Agregar cámara por escenario o diagnosticar:</span>
          </div>
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-1.5 min-w-0">
            {MODE_ORDER.map((mode) => {
              const meta = GUIDED_MODE_META[mode];
              return (
                <button
                  key={mode}
                  type="button"
                  disabled={isProcessing}
                  onClick={() => handleOpenGuidedCard(mode)}
                  className="min-w-0 text-left text-[11px] px-2.5 py-2 rounded-xl border border-neutral-800 bg-neutral-950 hover:bg-neutral-900 hover:border-sky-500/40 text-neutral-200 transition-colors flex items-center gap-1.5 cursor-pointer disabled:opacity-50 font-medium"
                >
                  <ModeIcon mode={mode} className="w-3.5 h-3.5 text-sky-400 shrink-0" />
                  <span className="truncate">{meta.shortLabel}</span>
                </button>
              );
            })}
            <button
              type="button"
              disabled={isProcessing}
              onClick={() =>
                processUserPrompt('Diagnosticar el estado en vivo de todas mis cámaras y medir latencia')
              }
              className="min-w-0 text-left text-[11px] px-2.5 py-2 rounded-xl border border-emerald-500/40 bg-emerald-950/40 hover:bg-emerald-900/50 text-emerald-300 transition-colors flex items-center gap-1.5 cursor-pointer disabled:opacity-50 font-semibold"
            >
              <Activity className="w-3.5 h-3.5 text-emerald-400 shrink-0" />
              <span className="truncate">Diagnóstico</span>
            </button>
          </div>
        </div>

        {/* Caja de Entrada libre */}
        <form
          onSubmit={handleFormSubmit}
          className="p-3 sm:p-4 bg-neutral-950 border-t border-neutral-800 flex items-center gap-2 shrink-0 min-w-0"
        >
          <input
            type="text"
            value={inputText}
            onChange={(e) => setInputText(e.target.value)}
            disabled={isProcessing}
            placeholder="O escribe tu consulta técnica / datos..."
            className="flex-1 min-w-0 bg-neutral-900 border border-neutral-700 focus:border-sky-500 rounded-xl px-3.5 py-2.5 sm:py-3 text-sm text-white placeholder-neutral-500 focus:outline-none transition-colors"
          />
          <button
            type="submit"
            disabled={!inputText.trim() || isProcessing}
            aria-label="Enviar"
            className="px-3.5 sm:px-4 py-2.5 sm:py-3 rounded-xl bg-sky-600 hover:bg-sky-500 disabled:bg-neutral-800 disabled:text-neutral-500 text-white font-semibold text-sm flex items-center justify-center gap-2 transition-colors shrink-0 cursor-pointer"
          >
            {isProcessing ? (
              <Loader2 className="w-4 h-4 animate-spin" />
            ) : (
              <>
                <PlusCircle className="w-4 h-4 hidden sm:inline" />
                <span className="hidden sm:inline">Enviar</span>
                <Send className="w-4 h-4 sm:hidden" />
              </>
            )}
          </button>
        </form>
      </div>
    </div>
  );
};
