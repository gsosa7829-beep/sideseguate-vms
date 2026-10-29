import React, { useEffect, useState } from 'react';
import { cloudP2pClient } from '../lib/cloudP2pClient';
import { currentTenantId, ownerIdForTenant } from '../lib/tenant';
import { loadGateway, isPublicGateway, isLocalGateway } from '../lib/streamGateway';
import { deviceLabel } from '../lib/deviceRegistry';
import {
  Activity,
  CheckCircle2,
  AlertTriangle,
  XCircle,
  RefreshCw,
  Cloud,
  RadioTower,
  HardDrive,
  Users,
} from 'lucide-react';

type Status = 'ok' | 'warn' | 'fail' | 'loading';

interface CheckRow {
  id: string;
  label: string;
  status: Status;
  detail: string;
  hint?: string;
}

const STATUS_STYLES: Record<Status, { dot: string; text: string; Icon: typeof CheckCircle2 }> = {
  ok: { dot: 'bg-emerald-400', text: 'text-emerald-300', Icon: CheckCircle2 },
  warn: { dot: 'bg-amber-400', text: 'text-amber-300', Icon: AlertTriangle },
  fail: { dot: 'bg-red-400', text: 'text-red-300', Icon: XCircle },
  loading: { dot: 'bg-sky-400 animate-pulse', text: 'text-sky-300', Icon: RefreshCw },
};

/**
 * Autodiagnóstico del sistema.
 *
 * Sirve para responder en 5 segundos a las dos preguntas que más cuesta
 * contestar desde fuera: "¿llegó el enlace a la nube?" y "¿por qué no veo video
 * continuo en el celular?".
 */
export const SystemDiagnosticsCard: React.FC = () => {
  const [rows, setRows] = useState<CheckRow[]>([]);
  const [running, setRunning] = useState(false);

  const runChecks = async () => {
    setRunning(true);
    const next: CheckRow[] = [];
    const tenantId = currentTenantId();
    const ownerId = ownerIdForTenant(tenantId);

    // 1. Espacio de datos (multi-tenant)
    next.push({
      id: 'tenant',
      label: 'Espacio de datos',
      status: 'ok',
      detail: `${tenantId} · ${ownerId}`,
      hint: 'Cada cliente ve únicamente sus cámaras y enlaces.',
    });

    // 2. Servidor de video (video continuo)
    const gateway = loadGateway();
    if (isPublicGateway(gateway.baseUrl)) {
      next.push({
        id: 'gateway',
        label: 'Servidor de video',
        status: 'ok',
        detail: gateway.baseUrl,
        hint: 'Video continuo disponible para clientes en 4G.',
      });
    } else if (isLocalGateway(gateway.baseUrl)) {
      next.push({
        id: 'gateway',
        label: 'Servidor de video',
        status: 'warn',
        detail: `${gateway.baseUrl} (solo este equipo)`,
        hint: 'Un celular no puede abrir "localhost". Configura el dominio público.',
      });
    } else {
      next.push({
        id: 'gateway',
        label: 'Servidor de video',
        status: 'warn',
        detail: 'Sin dominio público configurado',
        hint: 'Sin él, los clientes ven imágenes cada segundo (modo imagen).',
      });
    }

    // 3. Runner de cámaras / equipos reportados
    const devices = cloudP2pClient.getDevices();
    const state = cloudP2pClient.getState();
    if (!state.online) {
      next.push({
        id: 'runner',
        label: 'Concentrador de cámaras',
        status: 'fail',
        detail: 'Sin conexión',
        hint: 'El equipo que captura las cámaras no está reportando.',
      });
    } else if (devices.length === 0) {
      next.push({
        id: 'runner',
        label: 'Concentrador de cámaras',
        status: 'warn',
        detail: 'En línea, pero sin equipos reportados',
        hint: 'Revisa que el runner tenga el DVR encendido y en red.',
      });
    } else {
      next.push({
        id: 'runner',
        label: 'Equipos reportados',
        status: 'ok',
        detail: `${devices.length} · ${deviceLabel(devices[0])}`,
        hint:
          devices.length > 1
            ? 'Multi-dispositivo: cada cámara usa la serie de su propio equipo.'
            : undefined,
      });
    }

    // 4. Almacenamiento local
    let storageOk = false;
    try {
      const probe = '__sdg_probe__';
      localStorage.setItem(probe, '1');
      localStorage.removeItem(probe);
      storageOk = true;
    } catch {
      storageOk = false;
    }
    next.push({
      id: 'storage',
      label: 'Almacenamiento del navegador',
      status: storageOk ? 'ok' : 'fail',
      detail: storageOk ? 'Disponible' : 'Bloqueado',
      hint: storageOk
        ? undefined
        : 'En modo incógnito o con bloqueo estricto los enlaces no se guardan.',
    });

    // 5. Nube (Firestore) — la prueba real de la sincronización
    const cloudRow: CheckRow = {
      id: 'cloud',
      label: 'Sincronización en la nube',
      status: 'loading',
      detail: 'Comprobando…',
    };
    next.push(cloudRow);
    setRows([...next]);

    try {
      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), 6000);
      const res = await fetch(
        'https://firestore.googleapis.com/v1/projects/sideseguate-vms/databases/(default)/documents/cloud_share_links?pageSize=1',
        { signal: controller.signal, cache: 'no-store' }
      );
      clearTimeout(timer);
      cloudRow.status = res.ok ? 'ok' : 'warn';
      cloudRow.detail = res.ok
        ? `Firestore responde (HTTP ${res.status})`
        : `Firestore respondió HTTP ${res.status}`;
      cloudRow.hint = res.ok
        ? 'Un enlace generado aquí debe poder abrirse desde el celular.'
        : 'Puede ser un problema de reglas o de red; los enlaces seguirán funcionando en este equipo.';
    } catch {
      cloudRow.status = 'warn';
      cloudRow.detail = 'No se pudo contactar a Firestore';
      cloudRow.hint =
        'Sin internet o con bloqueo de red. Los enlaces locales siguen guardados en este equipo.';
    }

    setRows([...next]);
    setRunning(false);
  };

  useEffect(() => {
    runChecks();
  }, []);

  const worst: Status = rows.some((r) => r.status === 'fail')
    ? 'fail'
    : rows.some((r) => r.status === 'warn')
      ? 'warn'
      : rows.length === 0
        ? 'loading'
        : 'ok';

  return (
    <section className="bg-neutral-900 border border-neutral-800 rounded-xl p-4 sm:p-5 space-y-3">
      <header className="flex items-start justify-between gap-3 flex-wrap">
        <div className="flex items-start gap-2.5 min-w-0">
          <Activity className="w-5 h-5 text-sky-400 shrink-0 mt-0.5" />
          <div className="min-w-0">
            <h2 className="text-sm font-bold text-white">Autodiagnóstico</h2>
            <p className="text-xs text-neutral-400 mt-0.5">
              Qué está funcionando ahora mismo y qué impide ver las cámaras en el celular.
            </p>
          </div>
        </div>
        <button
          type="button"
          onClick={runChecks}
          disabled={running}
          className="shrink-0 px-3 py-1.5 bg-neutral-950 hover:bg-neutral-850 disabled:opacity-50 border border-neutral-800 text-neutral-300 rounded-lg text-xs font-medium flex items-center gap-1.5 transition"
        >
          <RefreshCw className={`w-3.5 h-3.5 ${running ? 'animate-spin' : ''}`} />
          Revisar
        </button>
      </header>

      <ul className="divide-y divide-neutral-850 border border-neutral-800 rounded-xl overflow-hidden">
        {rows.map((row) => {
          const style = STATUS_STYLES[row.status];
          const Icon = style.Icon;
          return (
            <li key={row.id} className="p-3 bg-neutral-950/40 flex items-start gap-2.5">
              <Icon className={`w-4 h-4 shrink-0 mt-0.5 ${style.text}`} />
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-2 flex-wrap">
                  <span className="text-xs font-semibold text-white">{row.label}</span>
                  <span className={`text-[10.5px] font-mono ${style.text} break-all`}>
                    {row.detail}
                  </span>
                </div>
                {row.hint && (
                  <p className="text-[11px] text-neutral-500 mt-0.5 leading-snug">{row.hint}</p>
                )}
              </div>
            </li>
          );
        })}
      </ul>

      <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 text-[10.5px] text-neutral-400">
        <span className="flex items-center gap-1.5">
          <Cloud className="w-3 h-3 text-sky-400" /> Nube
        </span>
        <span className="flex items-center gap-1.5">
          <RadioTower className="w-3 h-3 text-emerald-400" /> Video
        </span>
        <span className="flex items-center gap-1.5">
          <HardDrive className="w-3 h-3 text-amber-400" /> Almacenamiento
        </span>
        <span className="flex items-center gap-1.5">
          <Users className="w-3 h-3 text-purple-400" /> Espacio
        </span>
      </div>

      {worst === 'ok' && (
        <p className="text-[11px] text-emerald-300 bg-emerald-950/40 border border-emerald-800/50 rounded-lg p-2 flex items-center gap-1.5">
          <CheckCircle2 className="w-3.5 h-3.5" />
          Todo en orden: puedes compartir enlaces con confianza.
        </p>
      )}
    </section>
  );
};
