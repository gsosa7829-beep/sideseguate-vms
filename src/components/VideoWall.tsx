import React, { useEffect, useState } from 'react';
import { Camera } from '../lib/types';
import { LiveCameraPlayer } from './LiveCameraPlayer';
import { cloudP2pClient } from '../lib/cloudP2pClient';
import { LayoutGrid, Square, Plus, Eye, Link2, Grid3X3 } from 'lucide-react';

interface VideoWallProps {
  cameras: Camera[];
  onSelectCamera: (id: string) => void;
  onOpenNewCamera: () => void;
  onGenerateLink: (camera: Camera) => void;
}

export const VideoWall: React.FC<VideoWallProps> = ({
  cameras,
  onSelectCamera,
  onOpenNewCamera,
  onGenerateLink,
}) => {
  const [gridSize, setGridSize] = useState<'1' | '2' | '3'>('2');
  const [filterType, setFilterType] = useState<string>('all');
  /**
   * Estado del servidor, sin detalles técnicos: el operador sólo necesita
   * saber si está activo o no. Arranca en `false` para no mostrar una
   * falsa sensación de "todo bien" antes de la primera respuesta real.
   */
  const [serverOnline, setServerOnline] = useState(false);

  useEffect(() => {
    return cloudP2pClient.subscribe((state) => setServerOnline(Boolean(state.online)));
  }, []);

  const filteredCameras = cameras.filter((cam) => {
    if (filterType === 'all') return true;
    return cam.deviceType === filterType;
  });

  const onlineCameras = cameras.filter((c) => c.status === 'online');

  const filterTabs = [
    { id: 'all', label: `Todas (${cameras.length})` },
    { id: 'hikvision_dvr', label: 'Hikvision DVR' },
    { id: 'hikvision_ip', label: 'Hikvision IP' },
    { id: 'generic_rtsp', label: 'ONVIF / RTSP' },
  ];

  return (
    <div className="space-y-5">
      {/*
        Estado del servidor: UNA línea.
        Antes había cuatro tarjetas de métricas (varias con valores fijos) y un
        panel técnico enorme con serie del DVR, IP, latencia y cifrado. No
        aportaban nada al trabajo diario y empujaban las cámaras fuera de la
        primera pantalla en el móvil. Tampoco se muestra ninguna vista previa
        del servidor: basta con saber si está activo o no.
      */}
      <div
        className={`flex flex-wrap items-center gap-x-3 gap-y-1.5 rounded-xl border px-3.5 py-2.5 ${
          serverOnline
            ? 'border-emerald-500/30 bg-emerald-500/[0.06]'
            : 'border-neutral-800 bg-neutral-900/80'
        }`}
        role="status"
        aria-live="polite"
      >
        <span className="flex items-center gap-2 min-w-0">
          <span className="relative flex h-2 w-2 shrink-0" aria-hidden="true">
            {serverOnline && (
              <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-emerald-400 opacity-70" />
            )}
            <span
              className={`relative inline-flex h-2 w-2 rounded-full ${
                serverOnline ? 'bg-emerald-400' : 'bg-neutral-600'
              }`}
            />
          </span>
          <span
            className={`text-sm font-semibold ${
              serverOnline ? 'text-emerald-300' : 'text-neutral-400'
            }`}
          >
            {serverOnline ? 'Servidor activo' : 'Servidor inactivo'}
          </span>
        </span>

        <span className="text-neutral-700" aria-hidden="true">
          ·
        </span>

        <span className="text-xs text-neutral-400 tabular-nums">
          {onlineCameras.length} de {cameras.length}{' '}
          {cameras.length === 1 ? 'canal en línea' : 'canales en línea'}
        </span>
      </div>

      {/* Matrix Toolbar: Segmented Hardware Filter & Grid Layout Switcher */}
      <div className="flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-3 bg-neutral-900/60 border border-neutral-800/80 p-2.5 rounded-xl">
        {/* Interactive Segmented Filter Controls */}
        <div className="flex items-center gap-1 p-1 bg-neutral-950/90 border border-neutral-800/90 rounded-lg overflow-x-auto">
          {filterTabs.map((tab) => {
            const active = filterType === tab.id;
            return (
              <button
                key={tab.id}
                onClick={() => setFilterType(tab.id)}
                className={`px-3 py-1.5 text-xs font-medium rounded-md transition whitespace-nowrap shrink-0 ${
                  active
                    ? 'bg-gradient-to-r from-sky-600/30 to-sky-500/20 text-white border border-sky-500/40 font-semibold shadow-xs'
                    : 'text-neutral-400 hover:text-neutral-200 border border-transparent'
                }`}
              >
                {tab.label}
              </button>
            );
          })}
        </div>

        {/* Selector de matriz: sólo en PC. En el móvil todas las opciones dan
            una sola columna, así que el control no haría nada. */}
        <div className="hidden md:flex items-center justify-end gap-2">
          <span className="text-[11px] font-mono uppercase tracking-wider text-neutral-400 hidden md:inline">
            Matriz:
          </span>
          <div className="flex items-center bg-neutral-950/90 p-1 rounded-lg border border-neutral-800/90 text-xs">
            <button
              aria-label="Vista 1x1 individual"
              onClick={() => setGridSize('1')}
              className={`px-2.5 py-1 rounded-md transition flex items-center gap-1.5 whitespace-nowrap ${
                gridSize === '1'
                  ? 'bg-sky-500/20 text-white border border-sky-500/40 font-semibold'
                  : 'text-neutral-400 hover:text-white border border-transparent'
              }`}
              title="Vista 1x1 (Pantalla Grande)"
            >
              <Square className="w-3.5 h-3.5" />
              <span className="font-mono">1×1</span>
            </button>
            <button
              aria-label="Matriz 2x2 de cuatro cámaras"
              onClick={() => setGridSize('2')}
              className={`px-2.5 py-1 rounded-md transition flex items-center gap-1.5 whitespace-nowrap ${
                gridSize === '2'
                  ? 'bg-sky-500/20 text-white border border-sky-500/40 font-semibold'
                  : 'text-neutral-400 hover:text-white border border-transparent'
              }`}
              title="Matriz 2x2 (4 Canales)"
            >
              <LayoutGrid className="w-3.5 h-3.5" />
              <span className="font-mono">2×2</span>
            </button>
            <button
              aria-label="Matriz 3x3 de nueve cámaras"
              onClick={() => setGridSize('3')}
              className={`px-2.5 py-1 rounded-md transition flex items-center gap-1.5 whitespace-nowrap ${
                gridSize === '3'
                  ? 'bg-sky-500/20 text-white border border-sky-500/40 font-semibold'
                  : 'text-neutral-400 hover:text-white border border-transparent'
              }`}
              title="Matriz 3x3 (9 Canales)"
            >
              <Grid3X3 className="w-3.5 h-3.5" />
              <span className="font-mono">3×3</span>
            </button>
          </div>
        </div>
      </div>

      {/* Camera Matrix Grid */}
      {filteredCameras.length === 0 ? (
        <div className="bg-neutral-900 border border-neutral-800 rounded-xl p-12 text-center">
          <p className="text-sm font-medium text-white mb-1">No hay cámaras en esta categoría</p>
          <p className="text-xs text-neutral-400 mb-4">
            Agrega un nuevo canal RTSP o selecciona otro filtro de hardware.
          </p>
          <button
            onClick={onOpenNewCamera}
            className="px-4 py-2 bg-sky-600 hover:bg-sky-500 text-white font-semibold rounded-lg text-xs inline-flex items-center gap-1.5 transition"
          >
            <Plus className="w-3.5 h-3.5" />
            <span>Añadir Cámara</span>
          </button>
        </div>
      ) : (
        <div
          className={`grid gap-4 ${
            gridSize === '1'
              ? 'grid-cols-1'
              : gridSize === '2'
              ? 'grid-cols-1 md:grid-cols-2'
              : 'grid-cols-1 sm:grid-cols-2 lg:grid-cols-3'
          }`}
        >
          {filteredCameras.map((cam) => (
            <article
              key={cam.id}
              className="bg-neutral-900 border border-neutral-800 hover:border-sky-500/40 transition rounded-xl overflow-hidden flex flex-col"
            >
              {/* Camera Header Strip: Clean Unboxed Metadata */}
              <div className="px-4 py-2.5 bg-neutral-950/90 border-b border-neutral-800 flex items-center justify-between gap-3 text-xs">
                <div className="flex items-center gap-2 min-w-0">
                  <span
                    className={`w-2 h-2 rounded-full shrink-0 ${
                      cam.status === 'online' ? 'bg-emerald-400' : 'bg-amber-400'
                    }`}
                  />
                  <span className="font-mono text-[11px] text-sky-400 font-semibold shrink-0">
                    CH0{cam.channel}
                  </span>
                  <span className="text-neutral-600" aria-hidden="true">·</span>
                  <h2 className="font-display font-semibold text-white truncate">
                    {cam.name}
                  </h2>
                </div>

                <div className="flex items-center gap-1.5 text-neutral-400 text-[11px] font-mono tabular-nums whitespace-nowrap shrink-0">
                  <span>{cam.resolution.split(' ')[0]}</span>
                  <span aria-hidden="true">·</span>
                  <span className="text-neutral-300">{cam.codec}</span>
                </div>
              </div>

              {/* Video Feed Viewport */}
              <div className="flex-1 bg-black">
                <LiveCameraPlayer
                  camera={cam}
                  allowPtz={true}
                  allowAudio={true}
                  allowSnapshot={true}
                  showWatermark={false}
                  isCompact={gridSize !== '1'}
                />
              </div>

              {/* Camera Footer Strip */}
              <div className="px-3.5 sm:px-4 py-2.5 bg-neutral-950/90 border-t border-neutral-800 flex items-center justify-between gap-2.5 text-xs">
                <div className="text-neutral-400 truncate text-xs min-w-0">
                  <span className="text-neutral-300">{cam.locationDesc}</span>
                  <span className="mx-1.5 text-neutral-600" aria-hidden="true">·</span>
                  <span className="font-mono text-[11px] text-neutral-500">{cam.host}</span>
                </div>

                <div className="flex items-center gap-2 shrink-0">
                  <button
                    onClick={() => onSelectCamera(cam.id)}
                    className="h-8 px-3 bg-neutral-900 hover:bg-neutral-850 text-neutral-200 border border-neutral-800 rounded-lg transition flex items-center gap-1.5 text-xs font-medium whitespace-nowrap"
                    title="Inspeccionar cámara y control PTZ"
                  >
                    <Eye className="w-3.5 h-3.5 text-sky-400 shrink-0" />
                    <span>Detalle</span>
                  </button>
                  <button
                    onClick={() => onGenerateLink(cam)}
                    className="h-8 px-3 bg-gradient-to-r from-sky-600/20 to-sky-500/15 hover:from-sky-600/35 hover:to-sky-500/25 text-sky-300 border border-sky-500/35 rounded-lg transition flex items-center gap-1.5 text-xs font-semibold whitespace-nowrap"
                    title="Generar enlace privado para cliente"
                  >
                    <Link2 className="w-3.5 h-3.5 text-sky-400 shrink-0" />
                    <span>Compartir</span>
                  </button>
                </div>
              </div>
            </article>
          ))}
        </div>
      )}
    </div>
  );
};
