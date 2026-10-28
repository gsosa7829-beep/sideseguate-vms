import React from 'react';
import { AdminAccount } from '../lib/adminAuth';
import { ShieldAlert, Lock, Ban } from 'lucide-react';

interface AdminLoginScreenProps {
  accounts: AdminAccount[];
  onLoginSuccess: (account: AdminAccount) => void;
}

export const AdminLoginScreen: React.FC<AdminLoginScreenProps> = ({
  accounts,
  onLoginSuccess,
}) => {
  return (
    <div className="min-h-screen bg-neutral-950 text-neutral-100 flex flex-col justify-center items-center p-4 sm:p-6 relative overflow-hidden">
      <div
        className="absolute inset-0 opacity-20 pointer-events-none"
        style={{
          backgroundImage:
            'radial-gradient(circle at 50% 20%, rgba(239, 68, 68, 0.18), transparent 60%)',
        }}
      />

      <div className="w-full max-w-lg bg-neutral-900 border border-red-900/60 rounded-2xl shadow-2xl p-6 sm:p-8 text-center relative z-10 space-y-5">
        <div className="w-16 h-16 rounded-2xl bg-red-950/80 border border-red-800/80 text-red-400 flex items-center justify-center mx-auto shadow-lg">
          <Lock className="w-8 h-8" />
        </div>

        <div className="space-y-2">
          <div className="inline-flex items-center gap-1.5 text-xs font-mono uppercase tracking-wider text-red-400 font-bold">
            <Ban className="w-3.5 h-3.5" />
            <span>ACCESO EXTERNO DESACTIVADO</span>
          </div>
          <h1 className="text-xl sm:text-2xl font-bold text-white">
            Panel Administrativo Bloqueado
          </h1>
          <p className="text-xs sm:text-sm text-neutral-400 leading-relaxed">
            Todos los enlaces temporales, accesos remotos, inicios de sesión con cuentas y accesos con Google han sido deshabilitados por el propietario del sistema.
          </p>
        </div>

        <div className="bg-neutral-950 border border-neutral-800 rounded-xl p-4 text-left space-y-2.5 text-xs">
          <div className="flex items-center gap-2 text-red-300 font-semibold">
            <ShieldAlert className="w-4 h-4 text-red-400 shrink-0" />
            <span>Restricción Estricta de Dispositivo</span>
          </div>
          <p className="text-neutral-400 leading-relaxed">
            Por seguridad, ninguna persona o dispositivo externo tiene permitido ingresar a este panel ni visualizar cámaras en este momento. El sistema opera exclusivamente desde la consola local autorizada del propietario.
          </p>
        </div>

        <button
          type="button"
          onClick={() => {
            if (accounts && accounts.length > 0) {
              onLoginSuccess(accounts[0]);
            }
          }}
          className="w-full py-2.5 px-4 rounded-xl bg-blue-600 hover:bg-blue-500 text-white font-semibold text-xs transition shadow-lg"
        >
          Desbloquear Consola Local (Propietario)
        </button>

        <div className="pt-2 border-t border-neutral-800 text-[11px] font-mono text-neutral-500">
          SIDESEGUATE · Seguridad Electrónica · Acceso Cerrado
        </div>
      </div>
    </div>
  );
};
