import React from 'react';
import { BRAND_ICON_URL, BRAND_NAME, BRAND_SUBTITLE, LOGO_URL } from '../lib/assets';

interface BrandSquareIconProps {
  size?: number;
  className?: string;
}

/** Emblema cuadrado oficial de GLOBAL TECH listo para encabezados, QR y tarjetas. */
export const BrandSquareIcon: React.FC<BrandSquareIconProps> = ({
  size = 32,
  className = 'w-8 h-8 rounded-lg',
}) => (
  <img
    src={BRAND_ICON_URL}
    alt={`${BRAND_NAME} — ${BRAND_SUBTITLE}`}
    width={size}
    height={size}
    className={`object-cover bg-[#031931] border border-sky-500/40 shrink-0 shadow-sm ${className}`}
  />
);

interface BrandLogoBannerProps {
  className?: string;
}

/** Logotipo horizontal completo de GLOBAL TECH para pantallas de acceso e inicio. */
export const BrandLogoBanner: React.FC<BrandLogoBannerProps> = ({ className = '' }) => (
  <div
    className={`rounded-2xl overflow-hidden bg-[#031931] border border-sky-500/25 shadow-lg shadow-sky-950/40 p-2 ${className}`}
  >
    <img
      src={LOGO_URL}
      alt={`${BRAND_NAME} — ${BRAND_SUBTITLE}`}
      width={960}
      height={440}
      className="w-full h-auto block rounded-xl"
    />
  </div>
);
