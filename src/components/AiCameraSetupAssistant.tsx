import React, { useEffect, useMemo, useState } from 'react';
import { Camera, Project } from '../lib/types';
import {
  ParsedCameraSetupIntent,
  ChannelProbeResult,
  LiveDeviceDiagItem,
  GuidedConnectionMode,
  GuidedCameraSetupInput,
  EzvizPreviewResult,
  probeAndDiscoverChannels,
  buildCamerasFromWizard,
  processConversationWithAi,
  validateGuidedCameraInput,
  buildIntentFromGuidedForm,
  findExistingCamerasBySerial,
  fetchEzvizDevicePreview,
} from '../lib/aiCameraWizard';
import { ParsedDeviceQrResult } from '../lib/qrCameraParser';
import { formatCameraDisplayName, formatChannelBadge } from '../lib/livePlayback';
import { maskRtspUrl } from '../lib/rtspHelper';
import { saveDeviceVerificationCode, disableEzvizEncryption } from '../lib/ezvizAuth';
import { QrCameraScannerModal } from './QrCameraScannerModal';
import {
  Bot,
  Send,
  X,
  CheckCircle2,
  Loader2,
  Tv,
  Copy,
  Check,
  Eye,
  EyeOff,
  Zap,
  Activity,
  Wifi,
  Signal,
  AlertCircle,
  AlertTriangle,
  FolderOpen,
  QrCode,
  ArrowLeft,
  RefreshCw,
  Image as ImageIcon,
} from 'lucide-react';

interface AiCameraSetupAssistantProps {
  isOpen: boolean;
  onClose: () => void;
  projects: Project[];
  cameras: Camera[];
  onAddCamerasBatch: (newCameras: Camera[], clientName: string) => void;
  onCreateProject?: (project: Project) => void;
  onSelectCameraAndGoToWall: (cameraId: string) => void;
}

type AssistantTab = GuidedConnectionMode | 'diagnostics';

interface PendingReviewState {
  intent: ParsedCameraSetupIntent;
  probedChannels: ChannelProbeResult[];
  selectedProjectId: string;
  newProjectName: string;
  selectedChannels: Set<number>;
  channelNames: Record<number, string>;
  preview: EzvizPreviewResult | null;
  previewLoading: boolean;
}

interface SavedSummaryState {
  cameras: Camera[];
  projectName: string;
  probedChannels: ChannelProbeResult[];
}

const INPUT_CLASS =
  'w-full bg-neutral-950 border border-neutral-800 focus:border-sky-500 rounded-xl px-3 py-2 text-xs text-white placeholder-neutral-500 focus:outline-none transition';

function buildDefaultChannelName(
  intent: ParsedCameraSetupIntent,
  chInfo: ChannelProbeResult,
  totalChannels: number
): string {
  const cloudName = chInfo.detectedDeviceName?.trim();
  const isGeneric =
    !intent.cameraNamePrefix ||
    intent.cameraNamePrefix === intent.brandLabel ||
    /^C[aá]mara\s+(IP\s+|Hikvision\s+Remota|HiLook\s+4G)/i.test(intent.cameraNamePrefix) ||
    /^DVR\s+(Hikvision|HiLook)/i.test(intent.cameraNamePrefix);
  const base = formatCameraDisplayName(isGeneric && cloudName ? cloudName : intent.cameraNamePrefix);
  if (totalChannels === 1) return base || `Cámara ${chInfo.channel}`;
  return `Cámara ${chInfo.channel} · ${base || 'Canal'}`;
}

export const AiCameraSetupAssistant: React.FC<AiCameraSetupAssistantProps> = ({
  isOpen,
  onClose,
  projects,
  cameras,
  onAddCamerasBatch,
  onCreateProject,
  onSelectCameraAndGoToWall,
}) => {
  const [activeTab, setActiveTab] = useState<AssistantTab>('remote');
  const [form, setForm] = useState<GuidedCameraSetupInput>({
    mode: 'remote',
    brand: 'hikvision_ip',
    selectedProjectId: projects[0]?.id || '',
    cameraName: '',
    host: '',
    port: 554,
    username: 'admin',
    password: '',
    deviceSerial: '',
    verificationCode: '',
    channelsCount: 1,
  });
  const [newProjectName, setNewProjectName] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);
  const [qrBanner, setQrBanner] = useState<string | null>(null);
  const [isQrScannerOpen, setIsQrScannerOpen] = useState(false);

  const [isProbing, setIsProbing] = useState(false);
  const [probeStepText, setProbeStepText] = useState('');
  const [pendingReview, setPendingReview] = useState<PendingReviewState | null>(null);
  const [savedSummary, setSavedSummary] = useState<SavedSummaryState | null>(null);
  const [copiedUrlId, setCopiedUrlId] = useState<string | null>(null);

  // Diagnóstico en vivo
  const [diagLoading, setDiagLoading] = useState(false);
  const [diagItems, setDiagItems] = useState<LiveDeviceDiagItem[] | null>(null);
  const [diagSummary, setDiagSummary] = useState<string | null>(null);

  // Barra discreta de comando / consulta técnica rápida
  const [quickPrompt, setQuickPrompt] = useState('');
  const [quickLoading, setQuickLoading] = useState(false);
  const [quickReply, setQuickReply] = useState<string | null>(null);
  const [partialContext, setPartialContext] = useState('');

  useEffect(() => {
    if (!isOpen) return;
    if (!form.selectedProjectId && projects[0]?.id) {
      setForm((prev) => ({ ...prev, selectedProjectId: projects[0].id }));
    }
  }, [isOpen, projects, form.selectedProjectId]);

  // Detección en tiempo real de SN duplicado
  const duplicateMatches = useMemo(() => {
    const snToCheck = pendingReview?.intent.deviceSerial || form.deviceSerial;
    return findExistingCamerasBySerial(cameras, snToCheck);
  }, [cameras, form.deviceSerial, pendingReview?.intent.deviceSerial]);

  const duplicateSummary = useMemo(() => {
    if (duplicateMatches.length === 0) return null;
    const folderNames = Array.from(
      new Set(
        duplicateMatches.map((cam) => {
          const proj = projects.find((p) => p.id === cam.projectId);
          return proj ? proj.name : 'Muro';
        })
      )
    );
    const channels = duplicateMatches.map((c) => formatChannelBadge(c.channel)).join(', ');
    return {
      serial: (pendingReview?.intent.deviceSerial || form.deviceSerial).trim().toUpperCase(),
      count: duplicateMatches.length,
      folders: folderNames.join(', '),
      channels,
    };
  }, [duplicateMatches, projects, form.deviceSerial, pendingReview?.intent.deviceSerial]);

  if (!isOpen) return null;

  const switchModeTab = (tab: AssistantTab) => {
    setActiveTab(tab);
    setFormError(null);
    setQuickReply(null);

    if (tab === 'diagnostics') {
      if (!diagItems && !diagLoading) {
        void runLiveDiagnostics();
      }
      return;
    }

    setPendingReview(null);
    setSavedSummary(null);
    setForm((prev) => ({
      ...prev,
      mode: tab,
      brand: tab === 'remote' ? 'hikvision_ip' : prev.brand === 'hikvision_ip' && tab === 'local' ? 'hikvision_dvr' : prev.brand,
      channelsCount: tab === 'remote' ? 1 : prev.channelsCount < 1 ? 4 : prev.channelsCount,
    }));
  };

  const runLiveDiagnostics = async () => {
    if (diagLoading) return;
    setDiagLoading(true);
    try {
      const turn = await processConversationWithAi(
        'Diagnosticar el estado en vivo de todas mis cámaras y medir latencia',
        { cameras, projects, partialContext: '', history: [] }
      );
      setDiagItems(turn.diagnostics || []);
      setDiagSummary(turn.replyText);
    } finally {
      setDiagLoading(false);
    }
  };

  const handleQrDetected = (parsed: ParsedDeviceQrResult) => {
    setForm((prev) => ({
      ...prev,
      deviceSerial: parsed.deviceSerial || prev.deviceSerial,
      verificationCode: parsed.verificationCode || prev.verificationCode,
      brand: parsed.suggestedBrand || prev.brand,
      channelsCount:
        parsed.suggestedBrand === 'hikvision_dvr' && prev.channelsCount === 1
          ? 4
          : prev.channelsCount,
    }));
    setFormError(null);
    setQrBanner(
      `QR leído: ${parsed.deviceSerial || 'SN'}${parsed.verificationCode ? ` · ${parsed.verificationCode}` : ''}${
        parsed.model ? ` (${parsed.model})` : ''
      }`
    );
  };

  const startProbeAndReview = async (
    intent: ParsedCameraSetupIntent,
    targetProjectId: string,
    pendingNewProjectName: string
  ) => {
    setIsProbing(true);
    setSavedSummary(null);
    setPendingReview(null);
    setProbeStepText(
      intent.deviceSerial
        ? `Verificando serie ${intent.deviceSerial} en nube P2P...`
        : `Verificando ${intent.channelsCount} ${intent.channelsCount === 1 ? 'canal' : 'canales'} en ${intent.host}:${intent.port}...`
    );

    try {
      const probed = await probeAndDiscoverChannels(intent);
      const activeIds = probed.filter((c) => c.active).map((c) => c.channel);
      const initialSelected = new Set<number>(
        activeIds.length > 0 ? activeIds : probed.slice(0, 1).map((c) => c.channel)
      );
      const initialNames: Record<number, string> = {};
      probed.forEach((ch) => {
        initialNames[ch.channel] = buildDefaultChannelName(intent, ch, initialSelected.size || probed.length);
      });

      const hasSerial = Boolean(intent.deviceSerial);
      setPendingReview({
        intent,
        probedChannels: probed,
        selectedProjectId: targetProjectId,
        newProjectName: pendingNewProjectName,
        selectedChannels: initialSelected,
        channelNames: initialNames,
        preview: null,
        previewLoading: hasSerial,
      });

      if (hasSerial && intent.deviceSerial) {
        const firstActiveCh = activeIds[0] || probed[0]?.channel || 1;
        const preview = await fetchEzvizDevicePreview(intent.deviceSerial, firstActiveCh);
        setPendingReview((prev) =>
          prev ? { ...prev, preview, previewLoading: false } : prev
        );
      }
    } finally {
      setIsProbing(false);
    }
  };

  const handleVerifyFormSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (isProbing) return;

    const validationError = validateGuidedCameraInput(form);
    if (validationError) {
      setFormError(validationError);
      return;
    }
    if (form.selectedProjectId === '__NEW__' && newProjectName.trim().length < 2) {
      setFormError('Escribe el nombre de la nueva carpeta.');
      return;
    }

    setFormError(null);
    const intent = buildIntentFromGuidedForm({
      ...form,
      selectedProjectId:
        form.selectedProjectId === '__NEW__' ? undefined : form.selectedProjectId || undefined,
    });
    await startProbeAndReview(intent, form.selectedProjectId || '', newProjectName.trim());
  };

  const handleRefreshPreview = async () => {
    if (!pendingReview?.intent.deviceSerial || pendingReview.previewLoading) return;
    const serial = pendingReview.intent.deviceSerial;
    const ch = Array.from(pendingReview.selectedChannels)[0] || pendingReview.probedChannels[0]?.channel || 1;
    setPendingReview((prev) => (prev ? { ...prev, previewLoading: true } : prev));
    const preview = await fetchEzvizDevicePreview(serial, ch);
    setPendingReview((prev) => (prev ? { ...prev, preview, previewLoading: false } : prev));
  };

  const handleConfirmSave = () => {
    if (!pendingReview) return;
    const selectedList = Array.from(pendingReview.selectedChannels).sort((a, b) => a - b);
    if (selectedList.length === 0) return;

    let resolvedProjects = projects;
    let resolvedProjectId = pendingReview.selectedProjectId;

    if (resolvedProjectId === '__NEW__' && pendingReview.newProjectName.trim()) {
      const cleanFolderName = pendingReview.newProjectName.trim();
      const slug = cleanFolderName.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
      const newProj: Project = {
        id: `proj-${slug || 'custom'}-${Date.now().toString().slice(-4)}`,
        name: cleanFolderName.toUpperCase(),
        clientName: cleanFolderName,
        clientPhone: '',
        location: cleanFolderName,
        status: 'activo',
        equipmentNotes: '',
        createdAt: new Date().toISOString(),
      };
      onCreateProject?.(newProj);
      resolvedProjectId = newProj.id;
      resolvedProjects = [...projects, newProj];
    } else if (resolvedProjectId === '__NEW__') {
      resolvedProjectId = '';
    }

    const generatedCameras = buildCamerasFromWizard(
      pendingReview.intent,
      pendingReview.probedChannels,
      resolvedProjects,
      resolvedProjectId || undefined,
      {
        selectedChannels: selectedList,
        channelNames: pendingReview.channelNames,
      }
    );

    if (pendingReview.intent.deviceSerial && pendingReview.intent.verificationCode) {
      saveDeviceVerificationCode(
        pendingReview.intent.deviceSerial,
        pendingReview.intent.verificationCode
      );
      void disableEzvizEncryption(
        pendingReview.intent.deviceSerial,
        pendingReview.intent.verificationCode
      );
    }

    const targetProj = resolvedProjects.find((p) => p.id === generatedCameras[0]?.projectId);
    onAddCamerasBatch(
      generatedCameras,
      targetProj?.clientName ||
        pendingReview.probedChannels[0]?.detectedDeviceName ||
        pendingReview.intent.cameraNamePrefix ||
        'Asistente de Cámaras'
    );

    setSavedSummary({
      cameras: generatedCameras,
      projectName: targetProj?.name || 'Muro de Video',
      probedChannels: pendingReview.probedChannels.filter((c) =>
        pendingReview.selectedChannels.has(c.channel)
      ),
    });
    setPendingReview(null);
  };

  const handleQuickPromptSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const trimmed = quickPrompt.trim();
    if (!trimmed || quickLoading || isProbing) return;

    setQuickLoading(true);
    setQuickReply(null);
    setQuickPrompt('');

    try {
      const turn = await processConversationWithAi(trimmed, {
        cameras,
        projects,
        partialContext,
        history: quickReply ? [{ sender: 'bot', text: quickReply }] : [],
      });

      if (turn.mode === 'setup_camera' && turn.intent) {
        setPartialContext('');
        setActiveTab(turn.intent.deviceSerial && turn.intent.host === 'open.ezviz.com' ? 'remote' : 'local');
        await startProbeAndReview(
          turn.intent,
          form.selectedProjectId || projects[0]?.id || '',
          ''
        );
        return;
      }

      if (turn.mode === 'live_diagnostics' && turn.diagnostics) {
        setPartialContext('');
        setDiagItems(turn.diagnostics);
        setDiagSummary(turn.replyText);
        setActiveTab('diagnostics');
        return;
      }

      if (turn.mode === 'ask_missing_host') {
        setPartialContext(partialContext ? `${partialContext} ${trimmed}` : trimmed);
      } else {
        setPartialContext('');
      }
      setQuickReply(turn.replyText.replace(/\*\*/g, ''));
    } finally {
      setQuickLoading(false);
    }
  };

  const handleCopyUrl = (url: string, id: string) => {
    navigator.clipboard.writeText(url);
    setCopiedUrlId(id);
    setTimeout(() => setCopiedUrlId(null), 2000);
  };

  const handleResetToNew = () => {
    setSavedSummary(null);
    setPendingReview(null);
    setQrBanner(null);
    setFormError(null);
    setForm((prev) => ({
      ...prev,
      cameraName: '',
      deviceSerial: '',
      verificationCode: '',
      host: '',
      password: '',
    }));
    setNewProjectName('');
  };

  const showLocalFields = activeTab === 'local' || activeTab === 'hybrid';
  const showRemoteFields = activeTab === 'remote' || activeTab === 'hybrid';

  return (
    <>
      <div className="fixed inset-0 z-50 flex items-center justify-end bg-black/75 backdrop-blur-sm animate-fadeIn">
        <div className="relative w-full max-w-xl h-full max-h-dvh bg-neutral-950 border-l border-neutral-800 shadow-2xl flex flex-col overflow-hidden">
          {/* Header compacto */}
          <div className="px-4 sm:px-5 py-3.5 bg-neutral-900/95 border-b border-neutral-800 flex items-center justify-between gap-2.5 shrink-0">
            <div className="flex items-center gap-2.5 min-w-0">
              <div className="w-9 h-9 rounded-xl bg-sky-500/15 border border-sky-400/35 flex items-center justify-center text-sky-400 shrink-0">
                <Bot className="w-5 h-5" />
              </div>
              <div className="flex items-center gap-2 min-w-0">
                <h2 className="text-sm sm:text-base font-bold text-white tracking-tight truncate">
                  Asistente de Cámaras
                </h2>
                <span className="px-2 py-0.5 text-[10px] font-mono font-semibold bg-emerald-500/15 text-emerald-300 border border-emerald-500/30 rounded-full shrink-0">
                  Activo
                </span>
              </div>
            </div>

            <button
              type="button"
              onClick={onClose}
              aria-label="Cerrar asistente"
              className="min-w-[40px] min-h-[40px] p-2 rounded-lg text-neutral-400 hover:text-white hover:bg-neutral-800 transition flex items-center justify-center shrink-0 cursor-pointer"
            >
              <X className="w-5 h-5" />
            </button>
          </div>

          {/* 4 Pestañas directas (sin botones duplicados) */}
          <div className="px-3.5 sm:px-5 py-2.5 bg-neutral-950 border-b border-neutral-800/90 shrink-0">
            <div className="grid grid-cols-4 gap-1 p-1 bg-neutral-900 border border-neutral-800 rounded-xl text-[10px] sm:text-[11px] font-semibold">
              {(
                [
                  { id: 'remote', label: '4G / P2P', Icon: Signal },
                  { id: 'local', label: 'Red Local', Icon: Wifi },
                  { id: 'hybrid', label: 'Híbrido', Icon: Zap },
                  { id: 'diagnostics', label: 'Diagnóstico', Icon: Activity },
                ] as const
              ).map(({ id, label, Icon }) => {
                const selected = activeTab === id;
                return (
                  <button
                    key={id}
                    type="button"
                    disabled={isProbing}
                    onClick={() => switchModeTab(id)}
                    className={`min-h-[44px] sm:min-h-[38px] px-1 sm:px-2 py-1.5 rounded-lg transition flex flex-col sm:flex-row items-center justify-center gap-1 sm:gap-1.5 cursor-pointer disabled:opacity-50 ${
                      selected
                        ? id === 'diagnostics'
                          ? 'bg-emerald-600/25 text-emerald-200 border border-emerald-500/40'
                          : 'bg-sky-600/25 text-white border border-sky-500/45 shadow-xs'
                        : 'text-neutral-400 hover:text-white border border-transparent'
                    }`}
                  >
                    <Icon className="w-3.5 h-3.5 shrink-0" />
                    <span className="whitespace-nowrap leading-none">{label}</span>
                  </button>
                );
              })}
            </div>
          </div>

          {/* Área principal */}
          <div className="flex-1 overflow-y-auto p-4 sm:p-5 space-y-4">
            {/* Respuesta de consulta técnica libre (si aplica) */}
            {quickReply && (
              <div className="p-3.5 rounded-xl bg-neutral-900 border border-neutral-800 text-xs text-neutral-200 space-y-2">
                <div className="flex items-center justify-between gap-2 text-[11px] text-sky-400 font-semibold">
                  <span>Respuesta técnica</span>
                  <button
                    type="button"
                    onClick={() => setQuickReply(null)}
                    className="text-neutral-500 hover:text-white cursor-pointer"
                    aria-label="Cerrar respuesta"
                  >
                    <X className="w-3.5 h-3.5" />
                  </button>
                </div>
                <p className="whitespace-pre-line leading-relaxed">{quickReply}</p>
              </div>
            )}

            {activeTab === 'diagnostics' ? (
              /* PESTAÑA DIAGNÓSTICO EN VIVO */
              <div className="space-y-3">
                <div className="flex items-center justify-between gap-2">
                  <span className="text-xs font-semibold text-neutral-300">
                    Estado de cámaras ({cameras.length})
                  </span>
                  <button
                    type="button"
                    disabled={diagLoading}
                    onClick={() => void runLiveDiagnostics()}
                    className="min-h-[36px] px-3 py-1.5 rounded-lg bg-neutral-900 hover:bg-neutral-800 border border-neutral-800 text-xs font-semibold text-sky-300 flex items-center gap-1.5 transition cursor-pointer disabled:opacity-50"
                  >
                    <RefreshCw className={`w-3.5 h-3.5 ${diagLoading ? 'animate-spin' : ''}`} />
                    <span>{diagLoading ? 'Verificando...' : 'Actualizar'}</span>
                  </button>
                </div>

                {diagLoading && !diagItems ? (
                  <div className="p-8 rounded-xl bg-neutral-900/60 border border-neutral-800 flex flex-col items-center justify-center gap-2 text-xs text-neutral-400">
                    <Loader2 className="w-5 h-5 text-emerald-400 animate-spin" />
                    <span>Comprobando señal y latencia...</span>
                  </div>
                ) : diagItems && diagItems.length > 0 ? (
                  <div className="space-y-2">
                    {diagItems.map((d, idx) => (
                      <div
                        key={`${d.serial}-${d.channel}-${idx}`}
                        className="p-3 rounded-xl bg-neutral-900 border border-neutral-800 flex items-center justify-between gap-3 text-xs"
                      >
                        <div className="min-w-0">
                          <div className="flex items-center gap-2">
                            <span
                              className={`w-2 h-2 rounded-full shrink-0 ${
                                d.online ? 'bg-emerald-400' : 'bg-red-400'
                              }`}
                            />
                            <span className="font-semibold text-white truncate">
                              {formatCameraDisplayName(d.cameraName)}
                            </span>
                            <span className="font-mono text-[10px] text-neutral-400 shrink-0">
                              {formatChannelBadge(d.channel)}
                            </span>
                          </div>
                          <p className="text-[11px] text-neutral-400 truncate mt-0.5 font-mono">
                            {d.serial} · {d.statusMessage}
                          </p>
                        </div>
                        <span
                          className={`px-2 py-0.5 rounded-md font-mono text-[11px] font-semibold shrink-0 border ${
                            d.online
                              ? 'bg-emerald-950/60 border-emerald-500/35 text-emerald-300'
                              : 'bg-red-950/60 border-red-500/35 text-red-300'
                          }`}
                        >
                          {d.online ? `${d.latencyMs} ms` : 'Offline'}
                        </span>
                      </div>
                    ))}
                  </div>
                ) : (
                  <div className="p-6 rounded-xl bg-neutral-900/60 border border-neutral-800 text-center text-xs text-neutral-400">
                    {diagSummary || 'Sin dispositivos para diagnosticar.'}
                  </div>
                )}
              </div>
            ) : isProbing ? (
              /* ESTADO DE VERIFICACIÓN EN CURSO */
              <div className="p-8 rounded-2xl bg-neutral-900 border border-neutral-800 flex flex-col items-center justify-center gap-3 text-center">
                <Loader2 className="w-7 h-7 text-sky-400 animate-spin" />
                <div className="space-y-1">
                  <p className="text-sm font-semibold text-white">Verificando equipo</p>
                  <p className="text-xs font-mono text-neutral-400">{probeStepText}</p>
                </div>
              </div>
            ) : savedSummary ? (
              /* PASO FINAL: GUARDADO EN EL MURO */
              <div className="space-y-4">
                <div className="p-4 rounded-2xl bg-emerald-950/35 border border-emerald-500/35 space-y-2">
                  <div className="flex items-center gap-2 text-emerald-300 font-bold text-sm">
                    <CheckCircle2 className="w-4 h-4 shrink-0" />
                    <span>
                      {savedSummary.cameras.length}{' '}
                      {savedSummary.cameras.length === 1 ? 'cámara guardada' : 'cámaras guardadas'} en{' '}
                      {savedSummary.projectName}
                    </span>
                  </div>
                  <div className="space-y-1.5 pt-1">
                    {savedSummary.cameras.map((cam) => {
                      const chProbe = savedSummary.probedChannels.find((p) => p.channel === cam.channel);
                      const copyId = `saved-rtsp-${cam.id}`;
                      return (
                        <div
                          key={cam.id}
                          className="p-2.5 rounded-xl bg-neutral-950/90 border border-neutral-800 space-y-1 text-xs"
                        >
                          <div className="flex items-center justify-between gap-2">
                            <span className="font-semibold text-white truncate">
                              {formatCameraDisplayName(cam.name)}
                            </span>
                            <span className="font-mono text-[10px] text-sky-400 shrink-0">
                              {formatChannelBadge(cam.channel)} · {cam.codec}
                            </span>
                          </div>
                          {chProbe?.rtspUrlSub && (
                            <div className="flex items-center justify-between gap-2 font-mono text-[10px] text-neutral-400">
                              <span className="truncate">{maskRtspUrl(chProbe.rtspUrlSub)}</span>
                              <button
                                type="button"
                                onClick={() => handleCopyUrl(chProbe.rtspUrlSub, copyId)}
                                className="text-neutral-400 hover:text-white shrink-0 cursor-pointer"
                                title="Copiar RTSP"
                              >
                                {copiedUrlId === copyId ? (
                                  <Check className="w-3.5 h-3.5 text-emerald-400" />
                                ) : (
                                  <Copy className="w-3.5 h-3.5" />
                                )}
                              </button>
                            </div>
                          )}
                        </div>
                      );
                    })}
                  </div>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                  <button
                    type="button"
                    onClick={() => {
                      if (savedSummary.cameras[0]) {
                        onSelectCameraAndGoToWall(savedSummary.cameras[0].id);
                      }
                      onClose();
                    }}
                    className="min-h-[44px] px-4 py-2.5 rounded-xl bg-sky-600 hover:bg-sky-500 text-white font-semibold text-xs flex items-center justify-center gap-2 transition cursor-pointer"
                  >
                    <Eye className="w-4 h-4" />
                    <span>Ver en el Muro</span>
                  </button>
                  <button
                    type="button"
                    onClick={handleResetToNew}
                    className="min-h-[44px] px-4 py-2.5 rounded-xl bg-neutral-900 hover:bg-neutral-800 border border-neutral-800 text-neutral-200 font-semibold text-xs transition cursor-pointer"
                  >
                    Agregar otro equipo
                  </button>
                </div>
              </div>
            ) : pendingReview ? (
              /* PASO 2: CONFIRMACIÓN DE SEÑAL, VISTA PREVIA Y SELECCIÓN/RENOMBRADO DE CANALES */
              <div className="space-y-4">
                <div className="flex items-center justify-between gap-2">
                  <button
                    type="button"
                    onClick={() => setPendingReview(null)}
                    className="min-h-[36px] px-2.5 py-1 rounded-lg bg-neutral-900 hover:bg-neutral-800 border border-neutral-800 text-xs text-neutral-300 flex items-center gap-1.5 transition cursor-pointer"
                  >
                    <ArrowLeft className="w-3.5 h-3.5" />
                    <span>Editar datos</span>
                  </button>
                  <span className="font-mono text-[11px] text-neutral-400 truncate">
                    {pendingReview.intent.deviceSerial
                      ? `SN: ${pendingReview.intent.deviceSerial}`
                      : `${pendingReview.intent.host}:${pendingReview.intent.port}`}
                  </span>
                </div>

                {/* Alerta de SN duplicado */}
                {duplicateSummary && (
                  <div className="p-3 rounded-xl bg-amber-950/50 border border-amber-500/40 text-xs text-amber-200 flex items-start gap-2.5">
                    <AlertTriangle className="w-4 h-4 text-amber-400 shrink-0 mt-0.5" />
                    <div className="min-w-0">
                      <span className="font-semibold text-white">SN ya registrado:</span>{' '}
                      {duplicateSummary.serial} existe en {duplicateSummary.folders} ({duplicateSummary.channels}).
                    </div>
                  </div>
                )}

                {/* Vista previa en vivo P2P (cuando hay SN) */}
                {pendingReview.intent.deviceSerial && (
                  <div className="rounded-xl overflow-hidden border border-neutral-800 bg-neutral-900">
                    <div className="px-3 py-2 bg-neutral-950 border-b border-neutral-800 flex items-center justify-between text-[11px]">
                      <span className="font-semibold text-neutral-300 flex items-center gap-1.5">
                        <ImageIcon className="w-3.5 h-3.5 text-sky-400" />
                        Vista previa de señal
                      </span>
                      <button
                        type="button"
                        disabled={pendingReview.previewLoading}
                        onClick={() => void handleRefreshPreview()}
                        className="text-sky-400 hover:text-sky-300 flex items-center gap-1 font-mono cursor-pointer disabled:opacity-50"
                      >
                        <RefreshCw
                          className={`w-3 h-3 ${pendingReview.previewLoading ? 'animate-spin' : ''}`}
                        />
                        <span>Probar</span>
                      </button>
                    </div>

                    {pendingReview.previewLoading ? (
                      <div className="h-36 flex items-center justify-center gap-2 text-xs text-neutral-400 bg-black">
                        <Loader2 className="w-4 h-4 text-sky-400 animate-spin" />
                        <span>Obteniendo fotograma...</span>
                      </div>
                    ) : pendingReview.preview?.picUrl ? (
                      <div className="relative aspect-video bg-black">
                        <img
                          src={pendingReview.preview.picUrl}
                          alt="Vista previa de cámara"
                          className="w-full h-full object-cover"
                        />
                        <span className="absolute bottom-2 left-2 px-2 py-0.5 rounded bg-black/80 border border-emerald-500/40 text-[10px] font-mono text-emerald-300">
                          Señal verificada
                        </span>
                      </div>
                    ) : (
                      <div className="px-3 py-3 text-[11px] text-neutral-400 flex items-center gap-2">
                        <AlertCircle className="w-3.5 h-3.5 text-amber-400 shrink-0" />
                        <span>
                          {pendingReview.preview?.errorMessage || 'Sin miniatura disponible en este momento.'}
                        </span>
                      </div>
                    )}
                  </div>
                )}

                {/* Estado de cifrado */}
                {pendingReview.probedChannels.some((c) => c.requiresManualDecrypt) && (
                  <div className="p-2.5 rounded-xl bg-amber-950/40 border border-amber-500/35 text-[11px] text-amber-200">
                    Código guardado localmente. Para abrir en otros equipos sin clave, desactiva &ldquo;Cifrado de video&rdquo; en HiLookVision.
                  </div>
                )}

                {/* Selección y renombrado rápido de canales */}
                <div className="space-y-2.5">
                  <div className="flex items-center justify-between gap-2">
                    <span className="text-xs font-semibold text-white flex items-center gap-1.5">
                      <Tv className="w-3.5 h-3.5 text-sky-400" />
                      Canales ({pendingReview.selectedChannels.size}/{pendingReview.probedChannels.length})
                    </span>

                    {pendingReview.probedChannels.length > 1 && (
                      <div className="flex items-center gap-1.5 text-[11px]">
                        <button
                          type="button"
                          onClick={() =>
                            setPendingReview((prev) => {
                              if (!prev) return prev;
                              const activeOnly = prev.probedChannels
                                .filter((c) => c.active)
                                .map((c) => c.channel);
                              return {
                                ...prev,
                                selectedChannels: new Set(
                                  activeOnly.length > 0 ? activeOnly : [prev.probedChannels[0].channel]
                                ),
                              };
                            })
                          }
                          className="px-2 py-1 rounded-md bg-neutral-900 hover:bg-neutral-800 border border-neutral-800 text-neutral-300 cursor-pointer"
                        >
                          Solo activos
                        </button>
                        <button
                          type="button"
                          onClick={() =>
                            setPendingReview((prev) =>
                              prev
                                ? {
                                    ...prev,
                                    selectedChannels: new Set(prev.probedChannels.map((c) => c.channel)),
                                  }
                                : prev
                            )
                          }
                          className="px-2 py-1 rounded-md bg-neutral-900 hover:bg-neutral-800 border border-neutral-800 text-neutral-300 cursor-pointer"
                        >
                          Todos
                        </button>
                      </div>
                    )}
                  </div>

                  <div className="space-y-2 max-h-64 overflow-y-auto pr-0.5">
                    {pendingReview.probedChannels.map((ch) => {
                      const checked = pendingReview.selectedChannels.has(ch.channel);
                      return (
                        <div
                          key={ch.channel}
                          className={`p-2.5 rounded-xl border transition flex items-center gap-2.5 ${
                            checked
                              ? 'bg-neutral-900 border-sky-500/40'
                              : 'bg-neutral-950/60 border-neutral-800/80 opacity-65'
                          }`}
                        >
                          <input
                            type="checkbox"
                            checked={checked}
                            aria-label={`Seleccionar canal ${ch.channel}`}
                            onChange={() =>
                              setPendingReview((prev) => {
                                if (!prev) return prev;
                                const next = new Set(prev.selectedChannels);
                                if (next.has(ch.channel)) next.delete(ch.channel);
                                else next.add(ch.channel);
                                return { ...prev, selectedChannels: next };
                              })
                            }
                            className="w-4 h-4 rounded accent-sky-500 shrink-0 cursor-pointer"
                          />

                          <span className="font-mono text-[11px] font-bold text-sky-300 bg-sky-950/60 border border-sky-500/30 px-2 py-0.5 rounded shrink-0">
                            {formatChannelBadge(ch.channel)}
                          </span>

                          <input
                            type="text"
                            value={pendingReview.channelNames[ch.channel] ?? ''}
                            disabled={!checked}
                            onChange={(e) =>
                              setPendingReview((prev) =>
                                prev
                                  ? {
                                      ...prev,
                                      channelNames: {
                                        ...prev.channelNames,
                                        [ch.channel]: e.target.value,
                                      },
                                    }
                                  : prev
                              )
                            }
                            placeholder={`Cámara ${ch.channel}`}
                            className="flex-1 min-w-0 bg-neutral-950 border border-neutral-800 focus:border-sky-500 rounded-lg px-2.5 py-1.5 text-xs text-white focus:outline-none disabled:opacity-50"
                          />

                          <span
                            className={`w-2 h-2 rounded-full shrink-0 ${
                              ch.active ? 'bg-emerald-400' : 'bg-neutral-600'
                            }`}
                            title={ch.statusText}
                          />
                        </div>
                      );
                    })}
                  </div>
                </div>

                <button
                  type="button"
                  disabled={pendingReview.selectedChannels.size === 0}
                  onClick={handleConfirmSave}
                  className="w-full min-h-[44px] py-2.5 px-4 rounded-xl bg-emerald-600 hover:bg-emerald-500 disabled:opacity-40 text-white font-bold text-xs shadow-md flex items-center justify-center gap-2 transition cursor-pointer"
                >
                  <CheckCircle2 className="w-4 h-4" />
                  <span>
                    Guardar {pendingReview.selectedChannels.size}{' '}
                    {pendingReview.selectedChannels.size === 1 ? 'cámara' : 'cámaras'}
                  </span>
                </button>
              </div>
            ) : (
              /* PASO 1: FORMULARIO DIRECTO POR ESCENARIO */
              <form onSubmit={handleVerifyFormSubmit} className="space-y-4">
                {/* Banner QR leído */}
                {qrBanner && (
                  <div className="p-2.5 rounded-xl bg-emerald-950/50 border border-emerald-500/40 text-xs text-emerald-200 flex items-center justify-between gap-2">
                    <span className="font-mono truncate">{qrBanner}</span>
                    <button
                      type="button"
                      onClick={() => setQrBanner(null)}
                      className="text-emerald-300/70 hover:text-white cursor-pointer shrink-0"
                    >
                      <X className="w-3.5 h-3.5" />
                    </button>
                  </div>
                )}

                {/* Campos 4G / P2P con botón Escanear QR */}
                {showRemoteFields && (
                  <div className="space-y-2.5">
                    <div className="flex items-center justify-between gap-2">
                      <span className="text-[11px] font-semibold uppercase tracking-wider text-neutral-400">
                        Credenciales P2P / Etiqueta
                      </span>
                      <button
                        type="button"
                        onClick={() => setIsQrScannerOpen(true)}
                        className="min-h-[36px] px-3 py-1.5 rounded-lg bg-emerald-600/20 hover:bg-emerald-600/35 border border-emerald-500/45 text-emerald-300 text-xs font-semibold flex items-center gap-1.5 transition cursor-pointer"
                      >
                        <QrCode className="w-3.5 h-3.5 shrink-0" />
                        <span>Escanear QR</span>
                      </button>
                    </div>

                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
                      <div>
                        <label className="block text-[11px] font-semibold text-neutral-300 mb-1">
                          Número de Serie (SN) *
                        </label>
                        <input
                          type="text"
                          value={form.deviceSerial}
                          onChange={(e) =>
                            setForm((prev) => ({
                              ...prev,
                              deviceSerial: e.target.value.toUpperCase(),
                            }))
                          }
                          placeholder="FF9363192"
                          className={`${INPUT_CLASS} font-mono uppercase`}
                        />
                      </div>

                      <div>
                        <label className="block text-[11px] font-semibold text-neutral-300 mb-1">
                          Código de Verificación *
                        </label>
                        <input
                          type="text"
                          value={form.verificationCode}
                          onChange={(e) =>
                            setForm((prev) => ({
                              ...prev,
                              verificationCode: e.target.value.toUpperCase(),
                            }))
                          }
                          placeholder="WZRIKO"
                          className={`${INPUT_CLASS} font-mono uppercase`}
                        />
                      </div>
                    </div>

                    {duplicateSummary && (
                      <div className="p-2.5 rounded-xl bg-amber-950/50 border border-amber-500/40 text-[11px] text-amber-200 flex items-center gap-2">
                        <AlertTriangle className="w-3.5 h-3.5 text-amber-400 shrink-0" />
                        <span>
                          SN {duplicateSummary.serial} ya registrado en {duplicateSummary.folders} ({duplicateSummary.channels}).
                        </span>
                      </div>
                    )}
                  </div>
                )}

                {/* Campos Red Local */}
                {showLocalFields && (
                  <div className="space-y-2.5">
                    <span className="block text-[11px] font-semibold uppercase tracking-wider text-neutral-400">
                      Red Local (IP / RTSP)
                    </span>
                    <div className="grid grid-cols-1 sm:grid-cols-3 gap-2.5">
                      <div>
                        <label className="block text-[11px] font-semibold text-neutral-300 mb-1">
                          IP Local *
                        </label>
                        <input
                          type="text"
                          value={form.host}
                          onChange={(e) => setForm((prev) => ({ ...prev, host: e.target.value }))}
                          placeholder="192.168.1.115"
                          className={`${INPUT_CLASS} font-mono`}
                        />
                      </div>

                      <div>
                        <label className="block text-[11px] font-semibold text-neutral-300 mb-1">
                          Usuario *
                        </label>
                        <input
                          type="text"
                          value={form.username}
                          onChange={(e) => setForm((prev) => ({ ...prev, username: e.target.value }))}
                          placeholder="admin"
                          className={`${INPUT_CLASS} font-mono`}
                        />
                      </div>

                      <div>
                        <label className="block text-[11px] font-semibold text-neutral-300 mb-1">
                          Contraseña *
                        </label>
                        <div className="relative">
                          <input
                            type={showPassword ? 'text' : 'password'}
                            autoComplete="off"
                            value={form.password}
                            onChange={(e) => setForm((prev) => ({ ...prev, password: e.target.value }))}
                            placeholder="Clave DVR"
                            className={`${INPUT_CLASS} font-mono pr-9`}
                          />
                          <button
                            type="button"
                            aria-label={showPassword ? 'Ocultar contraseña' : 'Mostrar contraseña'}
                            onClick={() => setShowPassword((prev) => !prev)}
                            className="absolute right-1.5 top-1/2 -translate-y-1/2 p-1.5 rounded-lg text-neutral-400 hover:text-white cursor-pointer"
                          >
                            {showPassword ? (
                              <EyeOff className="w-3.5 h-3.5" />
                            ) : (
                              <Eye className="w-3.5 h-3.5" />
                            )}
                          </button>
                        </div>
                      </div>
                    </div>
                  </div>
                )}

                {/* Equipo y Canales */}
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
                  <div>
                    <label className="block text-[11px] font-semibold text-neutral-300 mb-1">
                      Tipo de Equipo
                    </label>
                    <select
                      value={form.brand}
                      onChange={(e) => {
                        const nextBrand = e.target.value as ParsedCameraSetupIntent['brand'];
                        setForm((prev) => ({
                          ...prev,
                          brand: nextBrand,
                          channelsCount:
                            nextBrand === 'hikvision_ip' || nextBrand === 'generic_rtsp'
                              ? 1
                              : prev.channelsCount === 1
                              ? 4
                              : prev.channelsCount,
                        }));
                      }}
                      className={INPUT_CLASS}
                    >
                      <option value="hikvision_ip">Cámara IP / 4G Hikvision</option>
                      <option value="hikvision_dvr">DVR / NVR Hikvision / HiLook</option>
                      <option value="dahua_dvr">Dahua XVR / DVR</option>
                      <option value="generic_rtsp">Genérica RTSP / ONVIF</option>
                    </select>
                  </div>

                  <div>
                    <label className="block text-[11px] font-semibold text-neutral-300 mb-1">
                      Canales
                    </label>
                    <select
                      value={
                        [1, 2, 4, 8, 16, 32, 64, 128].includes(form.channelsCount)
                          ? form.channelsCount
                          : 'custom'
                      }
                      onChange={(e) => {
                        const val = e.target.value;
                        if (val === 'custom') {
                          setForm((prev) => ({ ...prev, channelsCount: 24 }));
                        } else {
                          setForm((prev) => ({ ...prev, channelsCount: Number(val) }));
                        }
                      }}
                      className={INPUT_CLASS}
                    >
                      <option value={1}>1 Canal</option>
                      <option value={2}>2 Canales</option>
                      <option value={4}>4 Canales</option>
                      <option value={8}>8 Canales</option>
                      <option value={16}>16 Canales</option>
                      <option value={32}>32 Canales</option>
                      <option value={64}>64 Canales</option>
                      <option value={128}>128 Canales</option>
                      <option value="custom">Personalizado (1–128)</option>
                    </select>
                    {![1, 2, 4, 8, 16, 32, 64, 128].includes(form.channelsCount) && (
                      <input
                        type="number"
                        min={1}
                        max={128}
                        value={form.channelsCount}
                        onChange={(e) =>
                          setForm((prev) => ({
                            ...prev,
                            channelsCount: Math.max(1, Math.min(128, Number(e.target.value) || 1)),
                          }))
                        }
                        className={`${INPUT_CLASS} font-mono mt-1.5`}
                      />
                    )}
                  </div>
                </div>

                {/* Carpeta destino y nombre base */}
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
                  <div>
                    <label className="flex items-center gap-1 text-[11px] font-semibold text-neutral-300 mb-1">
                      <FolderOpen className="w-3 h-3 text-sky-400 shrink-0" />
                      Carpeta / Proyecto
                    </label>
                    <select
                      value={form.selectedProjectId || ''}
                      onChange={(e) =>
                        setForm((prev) => ({ ...prev, selectedProjectId: e.target.value }))
                      }
                      className={INPUT_CLASS}
                    >
                      {projects.map((p) => (
                        <option key={p.id} value={p.id}>
                          {p.name}
                        </option>
                      ))}
                      <option value="__NEW__">+ Nueva carpeta...</option>
                    </select>
                  </div>

                  <div>
                    <label className="block text-[11px] font-semibold text-neutral-300 mb-1">
                      Nombre base (opcional)
                    </label>
                    <input
                      type="text"
                      value={form.cameraName}
                      onChange={(e) =>
                        setForm((prev) => ({ ...prev, cameraName: e.target.value }))
                      }
                      placeholder={activeTab === 'remote' ? 'Portón Finca' : 'Bodega Central'}
                      className={INPUT_CLASS}
                    />
                  </div>
                </div>

                {form.selectedProjectId === '__NEW__' && (
                  <div>
                    <label className="block text-[11px] font-semibold text-sky-300 mb-1">
                      Nombre de la nueva carpeta *
                    </label>
                    <input
                      type="text"
                      value={newProjectName}
                      onChange={(e) => setNewProjectName(e.target.value)}
                      placeholder="Ej. Condominio Norte"
                      className={INPUT_CLASS}
                    />
                  </div>
                )}

                {formError && (
                  <div className="p-2.5 rounded-xl bg-red-950/60 border border-red-500/40 text-xs text-red-200 flex items-center gap-2">
                    <AlertCircle className="w-4 h-4 text-red-400 shrink-0" />
                    <span>{formError}</span>
                  </div>
                )}

                <button
                  type="submit"
                  className="w-full min-h-[44px] py-2.5 px-4 rounded-xl bg-sky-600 hover:bg-sky-500 active:scale-[0.99] text-white font-bold text-xs shadow-md flex items-center justify-center gap-2 transition cursor-pointer"
                >
                  <CheckCircle2 className="w-4 h-4" />
                  <span>Verificar conexión</span>
                </button>
              </form>
            )}
          </div>

          {/* Barra inferior discreta para comando o consulta rápida */}
          <form
            onSubmit={handleQuickPromptSubmit}
            className="p-3 sm:p-4 bg-neutral-950 border-t border-neutral-800 flex items-center gap-2 shrink-0"
          >
            <input
              type="text"
              value={quickPrompt}
              onChange={(e) => setQuickPrompt(e.target.value)}
              disabled={quickLoading || isProbing}
              placeholder="Comando rápido o consulta técnica..."
              className="flex-1 min-w-0 bg-neutral-900 border border-neutral-800 focus:border-sky-500 rounded-xl px-3.5 py-2.5 text-xs sm:text-sm text-white placeholder-neutral-500 focus:outline-none transition"
            />
            <button
              type="submit"
              disabled={!quickPrompt.trim() || quickLoading || isProbing}
              aria-label="Enviar consulta"
              className="min-h-[42px] px-3.5 py-2 rounded-xl bg-neutral-800 hover:bg-neutral-700 disabled:opacity-40 text-white text-xs font-semibold flex items-center justify-center gap-1.5 transition shrink-0 cursor-pointer"
            >
              {quickLoading ? (
                <Loader2 className="w-4 h-4 animate-spin" />
              ) : (
                <Send className="w-4 h-4" />
              )}
            </button>
          </form>
        </div>
      </div>

      <QrCameraScannerModal
        isOpen={isQrScannerOpen}
        onClose={() => setIsQrScannerOpen(false)}
        onDetected={handleQrDetected}
      />
    </>
  );
};
