import React, { useState } from 'react';
import { Camera, Project } from '../lib/types';
import { getCameraTacticalPosition } from '../lib/pcLauncherGenerator';
import { LiveCameraPlayer } from './LiveCameraPlayer';
import {
  Compass,
  Cctv,
  ShieldAlert,
  RotateCw,
  Eye,
  Link2,
  Move,
  Radio,
  Sparkles,
  CheckCircle2,
  MapPin,
} from 'lucide-react';

interface TacticalMapViewProps {
  cameras: Camera[];
  projects: Project[];
  onSelectCameraDetail: (cameraId: string) => void;
  onGenerateLinkForCamera: (camera: Camera) => void;
  onUpdateCameraPosition?: (camera: Camera) => void;
  onShowToast?: (msg: string) => void;
}

export const TacticalMapView: React.FC<TacticalMapViewProps> = ({
  cameras,
  projects,
  onSelectCameraDetail,
  onGenerateLinkForCamera,
  onUpdateCameraPosition,
  onShowToast,
}) => {
  const [selectedProjectFilter, setSelectedProjectFilter] = useState<string>('all');
  const [selectedCamId, setSelectedCamId] = useState<string>(cameras[0]?.id || '');
  const [showFovCones, setShowFovCones] = useState<boolean>(true);
  const [isRelocateMode, setIsRelocateMode] = useState<boolean>(false);
  const [activeAlertCamId, setActiveAlertCamId] = useState<string | null>(null);
  const [alertEventDescription, setAlertEventDescription] = useState<string | null>(null);

  const visibleCameras = cameras.filter(
    (c) => selectedProjectFilter === 'all' || c.projectId === selectedProjectFilter
  );

  const activeCamera =
    visibleCameras.find((c) => c.id === selectedCamId) ||
    visibleCameras[0] ||
    cameras[0];

  const activeCamIndex = Math.max(
    0,
    cameras.findIndex((c) => c.id === activeCamera?.id)
  );
  const activePos = activeCamera
    ? getCameraTacticalPosition(activeCamera, activeCamIndex)
    : { x: 50, y: 50, angle: 45, zoneLabel: 'Zona Central' };

  const handleRotateCone = (deltaDegrees: number) => {
    if (!activeCamera || !onUpdateCameraPosition) return;
    const nextAngle = (activePos.angle + deltaDegrees + 360) % 360;
    onUpdateCameraPosition({
      ...activeCamera,
      mapX: activePos.x,
      mapY: activePos.y,
      mapAngle: nextAngle,
    });
    if (onShowToast) {
      onShowToast(`Ángulo de visión de ${activeCamera.name} ajustado a ${nextAngle}°`);
    }
  };

  const handleMapCanvasClick = (e: React.MouseEvent<HTMLDivElement>) => {
    if (!isRelocateMode || !activeCamera || !onUpdateCameraPosition) return;
    const rect = e.currentTarget.getBoundingClientRect();
    const clickX = Math.max(8, Math.min(92, Math.round(((e.clientX - rect.left) / rect.width) * 100)));
    const clickY = Math.max(10, Math.min(90, Math.round(((e.clientY - rect.top) / rect.height) * 100)));

    onUpdateCameraPosition({
      ...activeCamera,
      mapX: clickX,
      mapY: clickY,
      mapAngle: activePos.angle,
    });
    setIsRelocateMode(false);
    if (onShowToast) {
      onShowToast(`Ubicación de ${activeCamera.name} actualizada en el plano (${clickX}%, ${clickY}%)`);
    }
  };

  const handleSimulateAcuSenseAlert = () => {
    if (visibleCameras.length === 0) return;
    const targetCam = activeCamera || visibleCameras[0];
    setSelectedCamId(targetCam.id);
    setActiveAlertCamId(targetCam.id);
    const events = [
      'Detección Humana AcuSense IA en línea perimetral',
      'Vehículo detectado en zona de acceso principal (ColorVu 24/7)',
      'Movimiento perimetral verificado por sensor infrarrojo EXIR',
    ];
    const picked = events[Math.floor(Math.random() * events.length)];
    setAlertEventDescription(`${picked} — ${targetCam.name}`);
    if (onShowToast) {
      onShowToast(`Alerta AcuSense IA detectada en ${targetCam.name}`);
    }
  };

  const architecturalZones = [
    {
      id: 'zone-a',
      code: 'ZONA A',
      title: 'Recepción & Oficinas',
      style: 'left-[4%] top-[6%] w-[36%] h-[38%]',
    },
    {
      id: 'zone-b',
      code: 'ZONA B',
      title: 'Pasillo Administrativo',
      style: 'left-[42%] top-[6%] w-[26%] h-[38%]',
    },
    {
      id: 'zone-d',
      code: 'ZONA D',
      title: 'Perímetro Exterior Norte',
      style: 'left-[70%] top-[6%] w-[26%] h-[42%]',
    },
    {
      id: 'zone-c',
      code: 'ZONA C',
      title: 'Portón Vehicular & Garita',
      style: 'left-[4%] top-[47%] w-[32%] h-[46%]',
    },
    {
      id: 'zone-e',
      code: 'ZONA E',
      title: 'Bodega & Área Operativa',
      style: 'left-[38%] top-[47%] w-[30%] h-[46%]',
    },
    {
      id: 'zone-f',
      code: 'ZONA F',
      title: 'Malla Perimetral Trasera',
      style: 'left-[70%] top-[51%] w-[26%] h-[42%]',
    },
  ];

  return (
    <div className="space-y-4">
      {/* Top Tactical Control Bar */}
      <div className="bg-neutral-900 border border-neutral-800 rounded-xl p-4 flex flex-col lg:flex-row items-start lg:items-center justify-between gap-3">
        <div>
          <div className="flex items-center gap-2 flex-wrap">
            <Compass className="w-4 h-4 text-sky-400" />
            <h2 className="text-sm font-bold text-white">
              Mapa Táctico y Plano Interactivo de Cobertura de Cámaras
            </h2>
            <span className="text-[11px] font-mono text-emerald-400 flex items-center gap-1">
              <Radio className="w-3.5 h-3.5" /> Radar AcuSense 2D Activo
            </span>
          </div>
          <p className="text-xs text-neutral-400 mt-0.5">
            Haz clic en cualquier pin de cámara sobre el plano arquitectónico para inspeccionar su video en vivo, rotar su cono de visión o verificar alertas perimetrales.
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2 w-full lg:w-auto">
          <select
            aria-label="Filtrar plano por sede o cliente"
            value={selectedProjectFilter}
            onChange={(e) => setSelectedProjectFilter(e.target.value)}
            className="bg-neutral-950 border border-neutral-800 text-xs text-neutral-200 rounded-lg px-3 py-1.5 focus:outline-none"
          >
            <option value="all">Todas las Sedes ({cameras.length} cámaras)</option>
            {projects.map((p) => (
              <option key={p.id} value={p.id}>
                {p.name}
              </option>
            ))}
          </select>

          <button
            type="button"
            onClick={() => setShowFovCones(!showFovCones)}
            className={`px-3 py-1.5 rounded-lg border text-xs font-medium transition cursor-pointer ${
              showFovCones
                ? 'bg-sky-500/15 border-sky-500/40 text-sky-300'
                : 'bg-neutral-950 border-neutral-800 text-neutral-400 hover:text-white'
            }`}
          >
            {showFovCones ? 'Conos FOV: Visibles' : 'Conos FOV: Ocultos'}
          </button>

          <button
            type="button"
            onClick={handleSimulateAcuSenseAlert}
            className="px-3 py-1.5 bg-amber-600/20 hover:bg-amber-600/30 text-amber-300 border border-amber-500/40 rounded-lg text-xs font-semibold flex items-center gap-1.5 transition cursor-pointer"
          >
            <ShieldAlert className="w-3.5 h-3.5 text-amber-400" />
            <span>Simular Alerta AcuSense IA</span>
          </button>
        </div>
      </div>

      {/* Active Intrusion Alert Banner if triggered */}
      {activeAlertCamId && alertEventDescription && (
        <div className="bg-red-950/70 border border-red-700/80 rounded-xl px-4 py-3 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 text-xs">
          <div className="flex items-center gap-2.5">
            <span className="w-2.5 h-2.5 rounded-full bg-red-500 animate-ping shrink-0" />
            <div>
              <span className="font-mono font-bold text-red-300 uppercase mr-2">
                [ALERTA PERIMETRAL ACUSENSE]
              </span>
              <span className="text-white font-medium">{alertEventDescription}</span>
            </div>
          </div>
          <button
            type="button"
            onClick={() => {
              setActiveAlertCamId(null);
              setAlertEventDescription(null);
            }}
            className="px-3 py-1 bg-neutral-900 hover:bg-neutral-800 text-neutral-200 border border-neutral-700 rounded-lg text-[11px] font-medium shrink-0 cursor-pointer"
          >
            Confirmar y Silenciar Alerta
          </button>
        </div>
      )}

      {/* Main Tactical Grid: 2D Floorplan Blueprint (Left 2 cols) + Live Camera Inspector (Right 1 col) */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        {/* Interactive Floorplan Blueprint */}
        <div className="lg:col-span-2 bg-neutral-900 border border-neutral-800 rounded-2xl p-4 flex flex-col justify-between space-y-3">
          <div className="flex flex-wrap items-center justify-between gap-2 text-xs">
            <div className="flex items-center gap-2">
              <span className="font-mono text-[11px] text-sky-400 uppercase font-semibold">
                PLANO ARQUITECTÓNICO DE SEDE · ESCALA TÁCTICA 1:100
              </span>
              {isRelocateMode && (
                <span className="text-[11px] font-mono text-amber-300 animate-pulse">
                  (Haz clic en cualquier punto del plano para mover la cámara seleccionada)
                </span>
              )}
            </div>

            <div className="flex items-center gap-3 text-[11px] text-neutral-400 font-mono">
              <span className="flex items-center gap-1">
                <span className="w-2 h-2 rounded-full bg-emerald-400" /> Online
              </span>
              <span className="flex items-center gap-1">
                <span className="w-2 h-2 rounded-full bg-sky-400" /> Seleccionada
              </span>
              <span className="flex items-center gap-1">
                <span className="w-2 h-2 rounded-full bg-red-500" /> Alerta IA
              </span>
            </div>
          </div>

          {/* 2D Blueprint Surface */}
          <div
            onClick={handleMapCanvasClick}
            data-testid="tactical-floorplan-canvas"
            className={`relative w-full h-[420px] sm:h-[460px] rounded-xl bg-neutral-950 border border-neutral-800 overflow-hidden select-none ${
              isRelocateMode ? 'cursor-crosshair ring-2 ring-amber-500/60' : 'cursor-default'
            }`}
          >
            {/* Subtle CAD Blueprint Grid Lines */}
            <svg
              className="absolute inset-0 w-full h-full opacity-20 pointer-events-none"
              xmlns="http://www.w3.org/2000/svg"
            >
              <defs>
                <pattern
                  id="tactical-grid"
                  width="36"
                  height="36"
                  patternUnits="userSpaceOnUse"
                >
                  <path
                    d="M 36 0 L 0 0 0 36"
                    fill="none"
                    stroke="#38bdf8"
                    strokeWidth="0.6"
                  />
                </pattern>
              </defs>
              <rect width="100%" height="100%" fill="url(#tactical-grid)" />
            </svg>

            {/* Architectural Rooms / Perimeter Zones */}
            {architecturalZones.map((zone) => (
              <div
                key={zone.id}
                className={`absolute ${zone.style} border border-sky-500/25 bg-neutral-900/35 rounded-lg p-2.5 flex flex-col justify-between pointer-events-none`}
              >
                <div className="flex items-center justify-between">
                  <span className="text-[10px] font-mono font-bold text-sky-400/80 tracking-wider">
                    {zone.code}
                  </span>
                  <span className="w-1.5 h-1.5 rounded-full bg-sky-500/30" />
                </div>
                <span className="text-[11px] font-medium text-neutral-400/90 truncate">
                  {zone.title}
                </span>
              </div>
            ))}

            {/* Compass Indicator */}
            <div className="absolute top-3 right-3 px-2 py-1 rounded bg-neutral-900/90 border border-neutral-800 text-[10px] font-mono text-neutral-400 pointer-events-none">
              N ↑ · RADAR VMS
            </div>

            {/* Camera Pins & FOV Vision Cones */}
            {visibleCameras.map((cam) => {
              const globalIdx = Math.max(
                0,
                cameras.findIndex((c) => c.id === cam.id)
              );
              const pos = getCameraTacticalPosition(cam, globalIdx);
              const isSelected = activeCamera?.id === cam.id;
              const isAlerting = activeAlertCamId === cam.id;

              return (
                <div
                  key={cam.id}
                  style={{ left: `${pos.x}%`, top: `${pos.y}%` }}
                  className="absolute -translate-x-1/2 -translate-y-1/2 z-10"
                >
                  {/* Field-of-View (FOV) Cone SVG */}
                  {showFovCones && (
                    <div
                      style={{ transform: `rotate(${pos.angle}deg)` }}
                      className="absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 w-36 h-36 pointer-events-none transition-transform duration-300"
                    >
                      <svg viewBox="0 0 100 100" className="w-full h-full overflow-visible">
                        <path
                          d="M 50 50 L 18 6 A 55 55 0 0 1 82 6 Z"
                          fill={
                            isAlerting
                              ? 'rgba(239, 68, 68, 0.32)'
                              : isSelected
                              ? 'rgba(56, 189, 248, 0.28)'
                              : 'rgba(16, 185, 129, 0.16)'
                          }
                          stroke={
                            isAlerting
                              ? 'rgba(248, 113, 113, 0.8)'
                              : isSelected
                              ? 'rgba(56, 189, 248, 0.7)'
                              : 'rgba(16, 185, 129, 0.4)'
                          }
                          strokeWidth="1"
                        />
                      </svg>
                    </div>
                  )}

                  {/* Interactive Camera Pin Button */}
                  <button
                    type="button"
                    aria-label={`Seleccionar cámara ${cam.name} en el mapa`}
                    onClick={(e) => {
                      e.stopPropagation();
                      setSelectedCamId(cam.id);
                    }}
                    className={`relative flex items-center gap-1.5 px-2.5 py-1.5 rounded-xl border text-xs font-semibold shadow-lg transition cursor-pointer ${
                      isAlerting
                        ? 'bg-red-600 text-white border-red-300 ring-4 ring-red-500/40 animate-bounce'
                        : isSelected
                        ? 'bg-blue-600 text-white border-sky-300 ring-2 ring-sky-400/50 scale-105'
                        : 'bg-neutral-900/95 text-neutral-200 border-neutral-700 hover:border-sky-400 hover:text-white'
                    }`}
                  >
                    <Cctv className="w-3.5 h-3.5 shrink-0" />
                    <span className="font-mono text-[11px]">CH{cam.channel}</span>
                    <span
                      className={`w-2 h-2 rounded-full shrink-0 ${
                        isAlerting
                          ? 'bg-white'
                          : cam.status === 'online'
                          ? 'bg-emerald-400'
                          : 'bg-amber-400'
                      }`}
                    />
                  </button>

                  {/* Camera Floating Label below Pin */}
                  <div className="mt-1 px-2 py-0.5 rounded bg-neutral-950/90 border border-neutral-800 text-[10px] text-neutral-300 whitespace-nowrap text-center pointer-events-none shadow-md">
                    {cam.name.split('(')[0].trim()}
                  </div>
                </div>
              );
            })}
          </div>

          {/* Bottom Floorplan Controls for Selected Camera */}
          {activeCamera && (
            <div className="pt-1 flex flex-wrap items-center justify-between gap-2 text-xs">
              <div className="flex items-center gap-2 text-neutral-300">
                <MapPin className="w-3.5 h-3.5 text-sky-400" />
                <span>
                  Pin seleccionado: <strong className="text-white">{activeCamera.name}</strong>
                </span>
                <span className="font-mono text-[11px] text-neutral-400">
                  ({activePos.x}%, {activePos.y}% · Cono {activePos.angle}°)
                </span>
              </div>

              <div className="flex flex-wrap items-center gap-1.5">
                <button
                  type="button"
                  onClick={() => handleRotateCone(-45)}
                  className="px-2.5 py-1 bg-neutral-950 hover:bg-neutral-800 text-neutral-200 border border-neutral-800 rounded-lg text-[11px] font-mono flex items-center gap-1 transition cursor-pointer"
                >
                  <RotateCw className="w-3 h-3 -scale-x-100 text-sky-400" />
                  <span>Rotar -45°</span>
                </button>

                <button
                  type="button"
                  onClick={() => handleRotateCone(45)}
                  className="px-2.5 py-1 bg-neutral-950 hover:bg-neutral-800 text-neutral-200 border border-neutral-800 rounded-lg text-[11px] font-mono flex items-center gap-1 transition cursor-pointer"
                >
                  <RotateCw className="w-3 h-3 text-sky-400" />
                  <span>Rotar +45°</span>
                </button>

                <button
                  type="button"
                  onClick={() => setIsRelocateMode(!isRelocateMode)}
                  className={`px-2.5 py-1 rounded-lg border text-[11px] font-medium flex items-center gap-1 transition cursor-pointer ${
                    isRelocateMode
                      ? 'bg-amber-500/20 border-amber-500 text-amber-300'
                      : 'bg-neutral-950 hover:bg-neutral-800 border-neutral-800 text-neutral-200'
                  }`}
                >
                  <Move className="w-3 h-3" />
                  <span>{isRelocateMode ? 'Cancelar Mover Pin' : 'Mover Pin en el Plano'}</span>
                </button>
              </div>
            </div>
          )}
        </div>

        {/* Right Column: Live Camera Inspector for Selected Pin */}
        <div className="lg:col-span-1 flex flex-col gap-3">
          {activeCamera ? (
            <div className="bg-neutral-900 border border-neutral-800 rounded-2xl p-4 space-y-3.5 flex flex-col justify-between h-full">
              <div className="space-y-3">
                <div className="flex items-center justify-between">
                  <span className="text-[11px] font-mono uppercase tracking-wider text-sky-400 font-bold flex items-center gap-1.5">
                    <Sparkles className="w-3.5 h-3.5" />
                    MONITOR EN VIVO DEL PIN SELECCIONADO
                  </span>
                  <span className="text-[11px] font-mono text-emerald-400 flex items-center gap-1">
                    <CheckCircle2 className="w-3.5 h-3.5" /> CH{activeCamera.channel} Activo
                  </span>
                </div>

                {/* Live Video Feed of Selected Pin */}
                <LiveCameraPlayer
                  camera={activeCamera}
                  allowPtz={activeCamera.ptzSupported}
                  allowAudio={true}
                  allowSnapshot={true}
                  showWatermark={true}
                  isCompact={true}
                />

                {/* Telemetry & Location Details */}
                <div className="bg-neutral-950 border border-neutral-800 rounded-xl p-3 space-y-2 text-xs">
                  <div className="font-bold text-white text-sm">{activeCamera.name}</div>
                  <p className="text-neutral-400 text-xs">{activePos.zoneLabel}</p>

                  <div className="pt-2 border-t border-neutral-800 grid grid-cols-2 gap-2 font-mono text-[11px]">
                    <div className="text-neutral-400">
                      Resolución: <span className="text-white">{activeCamera.resolution.split(' ')[0]}</span>
                    </div>
                    <div className="text-neutral-400">
                      Códec: <span className="text-sky-400">{activeCamera.codec}</span>
                    </div>
                    <div className="text-neutral-400">
                      Ángulo FOV: <span className="text-emerald-400">{activePos.angle}°</span>
                    </div>
                    <div className="text-neutral-400">
                      Visión: <span className="text-amber-300">{activeCamera.nightVision ? 'ColorVu / IR' : 'Día'}</span>
                    </div>
                  </div>
                </div>
              </div>

              {/* Quick Actions for Selected Map Camera */}
              <div className="pt-2 border-t border-neutral-800 grid grid-cols-2 gap-2">
                <button
                  type="button"
                  onClick={() => onSelectCameraDetail(activeCamera.id)}
                  className="py-2 px-3 bg-neutral-950 hover:bg-neutral-800 text-neutral-100 border border-neutral-800 rounded-xl text-xs font-semibold flex items-center justify-center gap-1.5 transition cursor-pointer"
                >
                  <Eye className="w-3.5 h-3.5 text-sky-400" />
                  <span>Inspección PTZ</span>
                </button>

                <button
                  type="button"
                  onClick={() => onGenerateLinkForCamera(activeCamera)}
                  className="py-2 px-3 bg-blue-600 hover:bg-blue-500 text-white rounded-xl text-xs font-semibold flex items-center justify-center gap-1.5 transition shadow-md cursor-pointer"
                >
                  <Link2 className="w-3.5 h-3.5" />
                  <span>Compartir Cámara</span>
                </button>
              </div>
            </div>
          ) : (
            <div className="bg-neutral-900 border border-neutral-800 rounded-2xl p-8 text-center text-xs text-neutral-400">
              Selecciona una cámara en el plano para ver su transmisión en tiempo real.
            </div>
          )}
        </div>
      </div>
    </div>
  );
};
