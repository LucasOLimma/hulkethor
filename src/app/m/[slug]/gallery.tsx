"use client";

import { useState } from "react";

// Galeria simples das fotos reais da suite (enviadas pelo dono).
export function SuiteGallery({ photos, number }: { photos: string[]; number: string }) {
  const [i, setI] = useState(0);
  if (photos.length === 0) {
    return (
      <div className="public-suite-cover" aria-hidden="true">
        <span>{number}</span>
      </div>
    );
  }
  const go = (d: number) => setI((cur) => (cur + d + photos.length) % photos.length);
  return (
    <div className="gallery">
      {/* eslint-disable-next-line @next/next/no-img-element -- foto do Storage do motel, ja otimizada no envio */}
      <img src={photos[i]} alt={`Suíte ${number}, foto ${i + 1} de ${photos.length}`} className="gallery-main" loading="lazy" />
      {photos.length > 1 && (
        <>
          <button type="button" className="gallery-nav prev" onClick={() => go(-1)} aria-label="Foto anterior">‹</button>
          <button type="button" className="gallery-nav next" onClick={() => go(1)} aria-label="Próxima foto">›</button>
          <div className="gallery-dots">
            {photos.map((_, k) => (
              <button key={k} type="button" className={k === i ? "on" : undefined} onClick={() => setI(k)} aria-label={`Foto ${k + 1}`} />
            ))}
          </div>
        </>
      )}
    </div>
  );
}
