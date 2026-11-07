import React, { useState, useRef, useEffect } from 'react';
import { Camera, Project } from '../lib/types';
import {
  ParsedCameraSetupIntent,
  ChannelProbeResult,
  LiveDeviceDiagItem,
  probeAndDiscoverChannels,
  buildCamerasFromWizard,
  processConversationWithAi,
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
} from 'lucide-react';

interface ChatMessage {
  id: string;
  sender: 'bot' | 'user';
  text: string;
  timestamp: string;
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

const QUICK_ACTIONS = [
  {
    label: 'Diagnosticar cámaras en vivo',
    prompt: 'Diagnosticar el estado en vivo de todas mis cámaras y medir latencia',
    isDiagnostic: true,
  },
  {
    label: 'Agregar DVR HiLook (4 canales)',
    prompt: 'Tengo un DVR HiLook de 4 canales en la IP 192.168.1.115 con usuario admin y clave HELGDM',
    isDiagnostic: false,
  },
  {
    label: 'Agregar Cámara 4G Ocós',
    prompt: 'Agregar cámara 4G Hikvision en la IP 192.168.1.120 serie FF9363270 usuario admin y clave LBNZYU',
    isDiagnostic: false,
  },
  {
    label: 'Solucionar "Sin conexión"',
    prompt: '¿Por qué mi DVR aparece sin conexión o con pantalla en negro y cómo lo soluciono?',
    isDiagnostic: false,
  },
];

export const AiCameraSetupAssistant: React.FC<AiCameraSetupAssistantProps> = ({
  isOpen,
  onClose,
  projects,
  cameras,
  onAddCamerasBatch,
  onSelectCameraAndGoToWall,
}) => {
  const defaultProjectId = projects[0]?.id || 'proj-calle-cementerio';
  const [inputText, setInputText] = useState<string>('');
  const [isProcessing, setIsProcessing] = useState<boolean>(false);
  const [copiedUrlId, setCopiedUrlId] = useState<string | null>(null);
  const [partialContext, setPartialContext] = useState<string>('');

  const [messages, setMessages] = useState<ChatMessage[]>(() => [
    {
      id: 'welcome-msg',
      sender: 'bot',
      text: '¡Hola! Soy tu Asistente de Cámaras. Escribe los datos de tu DVR o cámara (marca, IP o serie, usuario y clave) para configurarla automáticamente, o elige una consulta rápida abajo.',
      timestamp: new Date().toLocaleTimeString('es-GT', { hour: '2-digit', minute: '2-digit' }),
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
              }
            : m
        )
      );
      setIsProcessing(false);
      return;
    }

    if (aiTurn.mode === 'setup_camera' && aiTurn.intent) {
      setPartialContext('');
      const intent = aiTurn.intent;

      setMessages((prev) =>
        prev.map((m) =>
          m.id === thinkingMsgId
            ? {
                ...m,
                text: `Analizando **${intent.brandLabel}** en \`${intent.host}:${intent.port}\`...`,
                probeStepText: `Escaneando ${intent.channelsCount} ${
                  intent.channelsCount === 1 ? 'canal' : 'canales'
                } en puerto ${intent.port}...`,
              }
            : m
        )
      );

      const probed = await probeAndDiscoverChannels(intent);
      const targetProj = projects.find((p) => p.id === defaultProjectId);
      const generatedCameras = buildCamerasFromWizard(
        intent,
        probed,
        projects,
        defaultProjectId
      );

      onAddCamerasBatch(
        generatedCameras,
        targetProj?.clientName || intent.cameraNamePrefix || 'Asistente de Cámaras'
      );

      const activeCount = probed.filter((c) => c.active).length;

      setMessages((prev) =>
        prev.map((m) =>
          m.id === thinkingMsgId
            ? {
                ...m,
                isProbing: false,
                text:
                  aiTurn.replyText ||
                  `¡Listo! Probé la conexión con **${intent.brandLabel}** (\`${intent.host}:${intent.port}\`), detecté **${activeCount} ${
                    activeCount === 1 ? 'canal activo' : 'canales activos'
                  }** y los agregué al **Muro de Video**.`,
                intent,
                probedChannels: probed,
                addedCameras: generatedCameras,
              }
            : m
        )
      );

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
        <div className="px-5 py-4 bg-gradient-to-r from-sky-950/80 via-neutral-900 to-neutral-950 border-b border-neutral-800 flex items-center justify-between gap-3 shrink-0">
          <div className="flex items-center gap-3 min-w-0">
            <div className="w-10 h-10 rounded-xl bg-sky-500/20 border border-sky-400/40 flex items-center justify-center text-sky-400 shrink-0">
              <Bot className="w-5 h-5" />
            </div>
            <div className="min-w-0">
              <div className="flex items-center gap-2">
                <h2 className="text-base font-bold text-white tracking-tight">
                  Asistente de Cámaras
                </h2>
                <span className="px-2 py-0.5 text-[10px] font-semibold bg-emerald-500/20 text-emerald-300 border border-emerald-500/30 rounded-full flex items-center gap-1">
                  <Sparkles className="w-3 h-3" /> Activo
                </span>
              </div>
              <p className="text-xs text-neutral-400 truncate">
                Gestión inteligente, configuración y diagnóstico de cámaras
              </p>
            </div>
          </div>

          <button
            onClick={onClose}
            className="p-2 rounded-lg text-neutral-400 hover:text-white hover:bg-neutral-800/80 transition-colors shrink-0"
            title="Cerrar"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Historial de Conversación */}
        <div className="flex-1 overflow-y-auto p-5 space-y-4">
          {messages.map((msg) => (
            <div
              key={msg.id}
              className={`flex flex-col ${
                msg.sender === 'user' ? 'items-end' : 'items-start'
              }`}
            >
              <div
                className={`max-w-[90%] rounded-2xl px-4 py-3 text-sm leading-relaxed ${
                  msg.sender === 'user'
                    ? 'bg-sky-600 text-white rounded-br-xs shadow-md'
                    : 'bg-neutral-900/95 border border-neutral-800 text-neutral-200 rounded-bl-xs shadow-lg'
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
                          <span className="text-neutral-400 block">IP / Host:</span>
                          <span className="text-emerald-300 font-mono">
                            {msg.intent.host}:{msg.intent.port}
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
                              <div className="flex items-center justify-between">
                                <span className="font-bold text-white flex items-center gap-1.5">
                                  <span className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse" />
                                  Canal {ch.channel} ({ch.channelCodeMain} / {ch.channelCodeSub})
                                </span>
                                <span className="text-[10px] text-emerald-400 bg-emerald-950/60 px-2 py-0.5 rounded border border-emerald-500/30">
                                  Activo
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

        {/* Pruebas rápidas en 1 clic (incluyendo Diagnóstico en Vivo) */}
        <div className="px-5 py-3 bg-neutral-900/50 border-t border-neutral-800/80 space-y-2 shrink-0">
          <span className="block text-[11px] text-neutral-400 font-medium">
            Pruebas rápidas en 1 clic:
          </span>
          <div className="grid grid-cols-2 gap-2">
            {QUICK_ACTIONS.map((item, idx) => (
              <button
                key={idx}
                type="button"
                disabled={isProcessing}
                onClick={() => processUserPrompt(item.prompt)}
                className={`text-left text-xs px-3 py-2 rounded-xl border transition-colors flex items-center gap-2 cursor-pointer disabled:opacity-50 ${
                  item.isDiagnostic
                    ? 'bg-emerald-950/40 hover:bg-emerald-900/50 text-emerald-300 border-emerald-500/40 font-semibold'
                    : 'bg-neutral-950 hover:bg-neutral-900 text-neutral-300 hover:text-white border-neutral-800 hover:border-sky-500/40'
                }`}
              >
                {item.isDiagnostic ? (
                  <Activity className="w-3.5 h-3.5 text-emerald-400 shrink-0" />
                ) : (
                  <Zap className="w-3.5 h-3.5 text-amber-400 shrink-0" />
                )}
                <span className="truncate">{item.label}</span>
              </button>
            ))}
          </div>
        </div>

        {/* Caja de Entrada */}
        <form
          onSubmit={handleFormSubmit}
          className="p-4 bg-neutral-950 border-t border-neutral-800 flex items-center gap-2.5 shrink-0"
        >
          <input
            type="text"
            value={inputText}
            onChange={(e) => setInputText(e.target.value)}
            disabled={isProcessing}
            placeholder="Escribe a tu Asistente de Cámaras o ingresa datos del DVR..."
            className="flex-1 bg-neutral-900 border border-neutral-700 focus:border-sky-500 rounded-xl px-4 py-3 text-sm text-white placeholder-neutral-500 focus:outline-none transition-colors"
          />
          <button
            type="submit"
            disabled={!inputText.trim() || isProcessing}
            className="px-4 py-3 rounded-xl bg-sky-600 hover:bg-sky-500 disabled:bg-neutral-800 disabled:text-neutral-500 text-white font-semibold text-sm flex items-center gap-2 transition-colors shrink-0 cursor-pointer"
          >
            {isProcessing ? (
              <Loader2 className="w-4 h-4 animate-spin" />
            ) : (
              <>
                <PlusCircle className="w-4 h-4" />
                <span className="hidden sm:inline">Enviar</span>
                <Send className="w-3.5 h-3.5 sm:hidden" />
              </>
            )}
          </button>
        </form>
      </div>
    </div>
  );
};
