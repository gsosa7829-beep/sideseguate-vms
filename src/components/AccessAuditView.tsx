import React, { useState } from 'react';
import { AccessLog, ShareLink } from '../lib/types';
import { 
  History, 
  ShieldCheck, 
  Smartphone, 
  Laptop, 
  Camera as CameraIcon, 
  AlertTriangle, 
  CheckCircle2, 
  Clock, 
  Search, 
  Download,
  Filter
} from 'lucide-react';

interface AccessAuditViewProps {
  logs: AccessLog[];
  shareLinks: ShareLink[];
  onSimulateBuyerAccess?: () => void;
}

export const AccessAuditView: React.FC<AccessAuditViewProps> = ({
  logs,
  shareLinks,
  onSimulateBuyerAccess,
}) => {
  const [filterAction, setFilterAction] = useState<string>('all');
  const [searchQuery, setSearchQuery] = useState('');

  const filteredLogs = logs.filter((log) => {
    const matchesAction = filterAction === 'all' || log.action === filterAction;
    const matchesSearch =
      log.clientIp.includes(searchQuery) ||
      log.deviceInfo.toLowerCase().includes(searchQuery.toLowerCase());
    return matchesAction && matchesSearch;
  });

  const getLinkTitle = (linkId: string) => {
    const link = shareLinks.find((l) => l.id === linkId);
    return link ? `${link.clientName} (${link.title})` : 'Enlace Eliminado / Demo';
  };

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="bg-neutral-900/60 border border-neutral-850 p-4 rounded-xl flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
        <div>
          <div className="flex items-center gap-2 mb-1">
            <History className="w-4 h-4 text-neutral-400" />
            <h3 className="text-sm font-bold text-white tracking-tight">
              Auditoría & Historial de Accesos de Clientes
            </h3>
          </div>
          <p className="text-xs text-neutral-400 max-w-2xl leading-relaxed">
            Registro en tiempo real (Google Cloud Firestore) de cada comprador que abre su enlace desde celular 4G o Wi-Fi, capturas tomadas e intentos de PIN.
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          {onSimulateBuyerAccess && (
            <button
              type="button"
              onClick={onSimulateBuyerAccess}
              className="px-3 py-1.5 rounded-lg bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-semibold flex items-center gap-1.5 transition shadow-sm"
            >
              <Smartphone className="w-3.5 h-3.5" />
              <span>Simular Entrada de Comprador en Vivo (4G)</span>
            </button>
          )}
          <span className="px-2.5 py-1.5 rounded-lg bg-neutral-950 border border-neutral-800 text-xs font-mono text-emerald-400">
            {logs.length} Eventos Registrados
          </span>
        </div>
      </div>

      {/* Filter Toolbar */}
      <div className="bg-neutral-900/60 border border-neutral-850 p-3 rounded-xl flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-3 text-xs">
        <div className="flex items-center gap-2 flex-1 max-w-md bg-neutral-950/80 px-2.5 py-1.5 rounded-lg border border-neutral-850">
          <Search className="w-3.5 h-3.5 text-neutral-500 shrink-0" />
          <input
            type="text"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="Filtrar por IP o dispositivo..."
            className="bg-transparent border-none text-white text-xs placeholder-neutral-500 focus:outline-none w-full"
          />
        </div>

        <div className="flex items-center gap-2">
          <Filter className="w-3.5 h-3.5 text-neutral-500" />
          <select
            value={filterAction}
            onChange={(e) => setFilterAction(e.target.value)}
            className="bg-neutral-950 border border-neutral-800 text-neutral-300 text-xs rounded-lg px-2.5 py-1.5 focus:outline-none"
          >
            <option value="all">Todas las Acciones</option>
            <option value="stream_started">Transmisión Iniciada</option>
            <option value="snapshot_taken">Captura Guardada</option>
            <option value="auth_failed">PIN Incorrecto</option>
          </select>
        </div>
      </div>

      {/* Audit Log — tabla en PC */}
      <div className="hidden md:block bg-neutral-900/70 border border-neutral-850 rounded-xl overflow-hidden shadow-sm">
        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs">
            <thead className="bg-neutral-950 text-neutral-500 font-mono text-[10px] uppercase border-b border-neutral-850">
              <tr>
                <th className="py-2.5 px-4 font-medium">Fecha & Hora</th>
                <th className="py-2.5 px-4 font-medium">Acción</th>
                <th className="py-2.5 px-4 font-medium">Cliente / Enlace</th>
                <th className="py-2.5 px-4 font-medium">Dirección IP</th>
                <th className="py-2.5 px-4 font-medium">Navegador / SO</th>
                <th className="py-2.5 px-4 text-right font-medium">Duración</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-neutral-850">
              {filteredLogs.map((log) => {
                return (
                  <tr key={log.id} className="hover:bg-neutral-850/40 transition">
                    <td className="py-3 px-4 font-mono text-neutral-400 whitespace-nowrap">
                      {new Date(log.timestamp).toLocaleString('es-GT', {
                        day: '2-digit',
                        month: 'short',
                        hour: '2-digit',
                        minute: '2-digit',
                        second: '2-digit'
                      })}
                    </td>

                    <td className="py-3 px-4 whitespace-nowrap">
                      {log.action === 'stream_started' && (
                        <span className="inline-flex items-center gap-1.5 text-emerald-400 font-medium">
                          <span className="w-1.5 h-1.5 rounded-full bg-emerald-400" />
                          Streaming Activo
                        </span>
                      )}
                      {log.action === 'snapshot_taken' && (
                        <span className="inline-flex items-center gap-1.5 text-sky-400 font-medium">
                          <CameraIcon className="w-3.5 h-3.5" />
                          Captura Guardada
                        </span>
                      )}
                      {log.action === 'auth_failed' && (
                        <span className="inline-flex items-center gap-1.5 text-amber-400 font-medium">
                          <AlertTriangle className="w-3.5 h-3.5" />
                          Error de PIN
                        </span>
                      )}
                    </td>

                    <td className="py-3 px-4">
                      <div className="font-medium text-white truncate max-w-xs">
                        {getLinkTitle(log.shareLinkId)}
                      </div>
                    </td>

                    <td className="py-3 px-4 font-mono text-neutral-300 whitespace-nowrap">
                      {log.clientIp}
                    </td>

                    <td className="py-3 px-4 text-neutral-400 truncate max-w-xs">
                      {log.deviceInfo}
                    </td>

                    <td className="py-3 px-4 text-right font-mono text-neutral-300 whitespace-nowrap">
                      {log.durationSeconds > 60
                        ? `${Math.floor(log.durationSeconds / 60)}m ${log.durationSeconds % 60}s`
                        : `${log.durationSeconds}s`}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>

      {/* Audit Log — tarjetas en móvil */}
      <div className="md:hidden space-y-2">
        {filteredLogs.map((log) => (
          <div
            key={log.id}
            className="bg-neutral-900/70 border border-neutral-850 rounded-xl p-3 space-y-2 text-xs"
          >
            <div className="flex items-start justify-between gap-2">
              <div className="font-medium text-white truncate">
                {getLinkTitle(log.shareLinkId)}
              </div>
              <span className="font-mono text-[10px] text-neutral-500 whitespace-nowrap">
                {new Date(log.timestamp).toLocaleString('es-GT', {
                  day: '2-digit',
                  month: 'short',
                  hour: '2-digit',
                  minute: '2-digit',
                })}
              </span>
            </div>

            <div className="flex items-center gap-2 text-[11px]">
              {log.action === 'stream_started' && (
                <span className="inline-flex items-center gap-1.5 text-emerald-400 font-medium">
                  <span className="w-1.5 h-1.5 rounded-full bg-emerald-400" />
                  Streaming Activo
                </span>
              )}
              {log.action === 'snapshot_taken' && (
                <span className="inline-flex items-center gap-1.5 text-sky-400 font-medium">
                  <CameraIcon className="w-3.5 h-3.5" />
                  Captura Guardada
                </span>
              )}
              {log.action === 'auth_failed' && (
                <span className="inline-flex items-center gap-1.5 text-amber-400 font-medium">
                  <AlertTriangle className="w-3.5 h-3.5" />
                  Error de PIN
                </span>
              )}
            </div>

            <div className="grid grid-cols-2 gap-x-3 gap-y-1 pt-2 border-t border-neutral-850 font-mono text-[10px] text-neutral-400">
              <span className="truncate">IP: {log.clientIp}</span>
              <span className="text-right text-neutral-300">
                {log.durationSeconds > 60
                  ? `${Math.floor(log.durationSeconds / 60)}m ${log.durationSeconds % 60}s`
                  : `${log.durationSeconds}s`}
              </span>
              <span className="col-span-2 truncate text-neutral-500">{log.deviceInfo}</span>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
};
