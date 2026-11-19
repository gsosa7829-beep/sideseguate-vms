import React, { useEffect, useRef, useState } from 'react';
import { parseDeviceQrPayload, ParsedDeviceQrResult } from '../lib/qrCameraParser';
import { QrCode, X, Camera as CameraIcon, Upload, AlertCircle, Loader2 } from 'lucide-react';

interface QrCameraScannerModalProps {
  isOpen: boolean;
  onClose: () => void;
  onDetected: (result: ParsedDeviceQrResult) => void;
}

interface BarcodeDetectorLike {
  detect: (source: CanvasImageSource) => Promise<Array<{ rawValue?: string }>>;
}

declare global {
  interface Window {
    BarcodeDetector?: new (options?: { formats?: string[] }) => BarcodeDetectorLike;
  }
}

async function decodeImageDataWithJsQr(imageData: ImageData): Promise<string | null> {
  const mod = await import('jsqr');
  const jsQR = mod.default;
  const decoded = jsQR(imageData.data, imageData.width, imageData.height, {
    inversionAttempts: 'dontInvert',
  });
  return decoded?.data || null;
}

export const QrCameraScannerModal: React.FC<QrCameraScannerModalProps> = ({
  isOpen,
  onClose,
  onDetected,
}) => {
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const rafRef = useRef<number | null>(null);
  const stoppedRef = useRef<boolean>(false);

  const [cameraState, setCameraState] = useState<'starting' | 'active' | 'error'>('starting');
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [scanHint, setScanHint] = useState<string | null>(null);

  const stopCamera = () => {
    stoppedRef.current = true;
    if (rafRef.current !== null) {
      cancelAnimationFrame(rafRef.current);
      rafRef.current = null;
    }
    if (streamRef.current) {
      streamRef.current.getTracks().forEach((t) => t.stop());
      streamRef.current = null;
    }
  };

  const handleDecodedRaw = (rawValue: string): boolean => {
    const parsed = parseDeviceQrPayload(rawValue);
    if (!parsed) {
      setScanHint('QR detectado sin número de serie ni código de verificación válido.');
      return false;
    }
    stopCamera();
    onDetected(parsed);
    onClose();
    return true;
  };

  useEffect(() => {
    if (!isOpen) return;
    stoppedRef.current = false;
    setCameraState('starting');
    setErrorMsg(null);
    setScanHint(null);

    let activeDetector: BarcodeDetectorLike | null = null;
    if (typeof window !== 'undefined' && typeof window.BarcodeDetector === 'function') {
      try {
        activeDetector = new window.BarcodeDetector({ formats: ['qr_code'] });
      } catch {
        activeDetector = null;
      }
    }

    const start = async () => {
      if (typeof navigator === 'undefined' || !navigator.mediaDevices?.getUserMedia) {
        setCameraState('error');
        setErrorMsg('Cámara no disponible en este navegador. Usa "Subir foto".');
        return;
      }

      try {
        const stream = await navigator.mediaDevices.getUserMedia({
          video: {
            facingMode: { ideal: 'environment' },
            width: { ideal: 1280 },
            height: { ideal: 720 },
          },
          audio: false,
        });

        if (stoppedRef.current) {
          stream.getTracks().forEach((t) => t.stop());
          return;
        }

        streamRef.current = stream;
        const video = videoRef.current;
        if (!video) return;
        video.srcObject = stream;
        await video.play();
        setCameraState('active');

        let lastScanMs = 0;
        let scanningFrame = false;

        const tick = async (ts: number) => {
          if (stoppedRef.current) return;

          if (!scanningFrame && ts - lastScanMs >= 220 && video.readyState >= 2 && video.videoWidth > 0) {
            scanningFrame = true;
            lastScanMs = ts;
            try {
              let rawValue: string | null = null;

              if (activeDetector) {
                const hits = await activeDetector.detect(video);
                rawValue = hits.find((h) => h.rawValue)?.rawValue || null;
              } else {
                const canvas = canvasRef.current;
                if (canvas) {
                  const targetW = Math.min(720, video.videoWidth);
                  const scale = targetW / video.videoWidth;
                  const targetH = Math.max(1, Math.round(video.videoHeight * scale));
                  canvas.width = targetW;
                  canvas.height = targetH;
                  const ctx = canvas.getContext('2d', { willReadFrequently: true });
                  if (ctx) {
                    ctx.drawImage(video, 0, 0, targetW, targetH);
                    const imgData = ctx.getImageData(0, 0, targetW, targetH);
                    rawValue = await decodeImageDataWithJsQr(imgData);
                  }
                }
              }

              if (rawValue && handleDecodedRaw(rawValue)) {
                return;
              }
            } catch {
              // Ignorar error de fotograma individual y continuar escaneo
            } finally {
              scanningFrame = false;
            }
          }

          if (!stoppedRef.current) {
            rafRef.current = requestAnimationFrame(tick);
          }
        };

        rafRef.current = requestAnimationFrame(tick);
      } catch (err) {
        if (stoppedRef.current) return;
        const message = err instanceof Error ? err.message : '';
        setCameraState('error');
        setErrorMsg(
          /Permission|NotAllowed/i.test(message)
            ? 'Permiso de cámara denegado. Usa "Subir foto" para leer la etiqueta.'
            : 'No se pudo abrir la cámara. Usa "Subir foto" para leer el QR.'
        );
      }
    };

    void start();
    return () => {
      stopCamera();
    };
  }, [isOpen]);

  const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file) return;

    setErrorMsg(null);
    setScanHint(null);

    try {
      const bitmap = await createImageBitmap(file);
      const canvas = canvasRef.current || document.createElement('canvas');
      const maxDim = 1280;
      const scale = Math.min(1, maxDim / Math.max(bitmap.width, bitmap.height));
      canvas.width = Math.max(1, Math.round(bitmap.width * scale));
      canvas.height = Math.max(1, Math.round(bitmap.height * scale));
      const ctx = canvas.getContext('2d', { willReadFrequently: true });
      if (!ctx) {
        bitmap.close();
        setErrorMsg('No se pudo procesar la imagen.');
        return;
      }
      ctx.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
      bitmap.close();

      let rawValue: string | null = null;
      if (typeof window !== 'undefined' && typeof window.BarcodeDetector === 'function') {
        try {
          const detector = new window.BarcodeDetector({ formats: ['qr_code'] });
          const hits = await detector.detect(canvas);
          rawValue = hits.find((h) => h.rawValue)?.rawValue || null;
        } catch {
          rawValue = null;
        }
      }

      if (!rawValue) {
        const imgData = ctx.getImageData(0, 0, canvas.width, canvas.height);
        rawValue = await decodeImageDataWithJsQr(imgData);
      }

      if (!rawValue) {
        setErrorMsg('No se detectó ningún código QR en la imagen.');
        return;
      }

      handleDecodedRaw(rawValue);
    } catch {
      setErrorMsg('Error al leer la imagen seleccionada.');
    }
  };

  if (!isOpen) return null;

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label="Escanear código QR del equipo"
      onClick={() => {
        stopCamera();
        onClose();
      }}
      className="fixed inset-0 z-[70] flex items-center justify-center p-3 sm:p-4 bg-black/85 backdrop-blur-sm"
    >
      <div
        onClick={(e) => e.stopPropagation()}
        className="w-full max-w-md bg-neutral-900 border border-neutral-800 rounded-2xl overflow-hidden shadow-2xl text-neutral-100"
      >
        <div className="px-4 py-3 bg-neutral-950 border-b border-neutral-800 flex items-center justify-between gap-2">
          <div className="flex items-center gap-2 min-w-0">
            <QrCode className="w-4 h-4 text-emerald-400 shrink-0" />
            <h3 className="text-sm font-bold text-white truncate">Escanear QR de etiqueta</h3>
          </div>
          <button
            type="button"
            aria-label="Cerrar escáner QR"
            onClick={() => {
              stopCamera();
              onClose();
            }}
            className="min-w-[36px] min-h-[36px] p-1.5 rounded-lg text-neutral-400 hover:text-white hover:bg-neutral-800 flex items-center justify-center transition cursor-pointer"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        <div className="p-4 space-y-3">
          <div className="relative aspect-square w-full bg-black rounded-xl overflow-hidden border border-neutral-800 flex items-center justify-center">
            <video
              ref={videoRef}
              playsInline
              muted
              className={`w-full h-full object-cover ${cameraState === 'active' ? 'opacity-100' : 'opacity-0'}`}
            />
            <canvas ref={canvasRef} className="hidden" />

            {cameraState === 'active' && (
              <div className="absolute inset-0 pointer-events-none flex items-center justify-center">
                <div className="w-56 h-56 rounded-2xl border-2 border-emerald-400/80 shadow-[0_0_0_9999px_rgba(0,0,0,0.45)]" />
              </div>
            )}

            {cameraState === 'starting' && (
              <div className="absolute inset-0 flex flex-col items-center justify-center gap-2 text-xs text-neutral-400">
                <Loader2 className="w-6 h-6 text-sky-400 animate-spin" />
                <span>Iniciando cámara...</span>
              </div>
            )}

            {cameraState === 'error' && (
              <div className="absolute inset-0 flex flex-col items-center justify-center gap-2 p-5 text-center">
                <CameraIcon className="w-7 h-7 text-neutral-500" />
                <p className="text-xs text-neutral-300">{errorMsg}</p>
              </div>
            )}
          </div>

          {scanHint && (
            <div className="p-2.5 rounded-xl bg-amber-950/60 border border-amber-500/40 text-[11px] text-amber-200 flex items-center gap-2">
              <AlertCircle className="w-4 h-4 text-amber-400 shrink-0" />
              <span>{scanHint}</span>
            </div>
          )}

          {errorMsg && cameraState !== 'error' && (
            <div className="p-2.5 rounded-xl bg-red-950/60 border border-red-500/40 text-[11px] text-red-200 flex items-center gap-2">
              <AlertCircle className="w-4 h-4 text-red-400 shrink-0" />
              <span>{errorMsg}</span>
            </div>
          )}

          <input
            ref={fileInputRef}
            type="file"
            accept="image/*"
            capture="environment"
            onChange={handleFileChange}
            className="hidden"
          />

          <div className="grid grid-cols-2 gap-2">
            <button
              type="button"
              onClick={() => fileInputRef.current?.click()}
              className="min-h-[42px] px-3 py-2 rounded-xl bg-neutral-800 hover:bg-neutral-700 border border-neutral-700 text-xs font-semibold text-white flex items-center justify-center gap-2 transition cursor-pointer"
            >
              <Upload className="w-3.5 h-3.5 text-sky-400 shrink-0" />
              <span>Subir foto</span>
            </button>
            <button
              type="button"
              onClick={() => {
                stopCamera();
                onClose();
              }}
              className="min-h-[42px] px-3 py-2 rounded-xl bg-neutral-950 hover:bg-neutral-800 border border-neutral-800 text-xs font-semibold text-neutral-300 transition cursor-pointer"
            >
              Cancelar
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};
