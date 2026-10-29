import React from 'react';
import { AlertTriangle, RefreshCw, ShieldAlert } from 'lucide-react';

interface ErrorBoundaryProps {
  children: React.ReactNode;
}

interface ErrorBoundaryState {
  error: Error | null;
}

/**
 * Red de seguridad de la interfaz: si una vista falla al renderizar
 * (por ejemplo un chunk que no carga por falta de red), se muestra una
 * pantalla de recuperación en vez de dejar el panel completamente en blanco.
 */
export class ErrorBoundary extends React.Component<ErrorBoundaryProps, ErrorBoundaryState> {
  state: ErrorBoundaryState = { error: null };

  static getDerivedStateFromError(error: Error): ErrorBoundaryState {
    return { error };
  }

  componentDidCatch(error: Error, info: React.ErrorInfo): void {
    console.error('[SIDESEGUATE] Error de render:', error, info.componentStack);
  }

  private handleReload = (): void => {
    window.location.reload();
  };

  private handleSoftReset = (): void => {
    this.setState({ error: null });
  };

  render(): React.ReactNode {
    const { error } = this.state;
    if (!error) return this.props.children;

    const isChunkError = /chunk|dynamically imported module|Loading chunk/i.test(error.message);

    return (
      <div className="min-h-dvh bg-neutral-950 text-neutral-100 flex items-center justify-center p-6">
        <div className="w-full max-w-md bg-neutral-900 border border-neutral-800 rounded-2xl p-6 space-y-4 shadow-2xl">
          <div className="flex items-center gap-2.5">
            <div className="w-10 h-10 rounded-xl bg-amber-950/60 border border-amber-600/40 flex items-center justify-center">
              {isChunkError ? (
                <ShieldAlert className="w-5 h-5 text-amber-400" />
              ) : (
                <AlertTriangle className="w-5 h-5 text-amber-400" />
              )}
            </div>
            <div>
              <h1 className="text-sm font-bold text-white">
                {isChunkError ? 'Se perdió la conexión con un módulo' : 'Algo salió mal'}
              </h1>
              <p className="text-[11px] text-neutral-400">
                {isChunkError
                  ? 'Hubo un corte de red mientras se cargaba esta sección.'
                  : 'La vista encontró un error inesperado.'}
              </p>
            </div>
          </div>

          <pre className="text-[10px] font-mono text-neutral-500 bg-neutral-950 border border-neutral-800 rounded-lg p-2.5 overflow-x-auto max-h-28">
            {error.message}
          </pre>

          <div className="flex flex-col sm:flex-row gap-2">
            <button
              type="button"
              onClick={this.handleReload}
              className="flex-1 py-2.5 px-3 bg-sky-600 hover:bg-sky-500 text-white rounded-xl text-xs font-bold flex items-center justify-center gap-1.5 transition"
            >
              <RefreshCw className="w-3.5 h-3.5" />
              Recargar el panel
            </button>
            <button
              type="button"
              onClick={this.handleSoftReset}
              className="flex-1 py-2.5 px-3 bg-neutral-800 hover:bg-neutral-700 border border-neutral-700 text-neutral-200 rounded-xl text-xs font-semibold transition"
            >
              Reintentar sin recargar
            </button>
          </div>
        </div>
      </div>
    );
  }
}
