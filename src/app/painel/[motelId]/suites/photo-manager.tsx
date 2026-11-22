"use client";

import { startTransition, useActionState, useRef, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { MAX_PHOTOS, PHOTO_BUCKET } from "@/lib/suite-photos";
import { newKey } from "@/components/app/keyed-form";
import { deletePhoto, makeCover, registerPhoto, type PhotoState } from "./photo-actions";

export type PhotoView = { id: string; url: string };

/** Reduz a foto no navegador (lado maior 1600 px, WebP), para economizar espaco. */
async function shrink(file: File): Promise<Blob> {
  const bitmap = await createImageBitmap(file);
  const scale = Math.min(1, 1600 / Math.max(bitmap.width, bitmap.height));
  const canvas = document.createElement("canvas");
  canvas.width = Math.round(bitmap.width * scale);
  canvas.height = Math.round(bitmap.height * scale);
  canvas.getContext("2d")!.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
  const blob = await new Promise<Blob | null>((ok) => canvas.toBlob(ok, "image/webp", 0.82));
  if (blob && blob.type === "image/webp") return blob;
  const jpg = await new Promise<Blob | null>((ok) => canvas.toBlob(ok, "image/jpeg", 0.85));
  if (!jpg) throw new Error("sem imagem");
  return jpg;
}

export function PhotoManager({ motelId, suiteId, photos }: { motelId: string; suiteId: string; photos: PhotoView[] }) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState(false);
  const [uploadError, setUploadError] = useState<string | null>(null);
  const [regState, register] = useActionState<PhotoState, FormData>(registerPhoto, undefined);
  const [delState, remove, removing] = useActionState<PhotoState, FormData>(deletePhoto, undefined);
  const [coverState, cover] = useActionState<PhotoState, FormData>(makeCover, undefined);
  const msg = uploadError ? { error: uploadError } : (delState ?? coverState ?? regState);

  const onFile = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (!file) return;
    setUploadError(null);
    if (!file.type.startsWith("image/")) return setUploadError("Escolha um arquivo de imagem (JPG, PNG ou WebP).");
    if (file.size > 25 * 1024 * 1024) return setUploadError("Imagem muito grande (máximo 25 MB).");
    setBusy(true);
    try {
      const blob = await shrink(file);
      const ext = blob.type === "image/webp" ? "webp" : "jpg";
      const path = `${motelId}/${suiteId}/${newKey()}.${ext}`;
      const { error } = await createClient().storage.from(PHOTO_BUCKET).upload(path, blob, { contentType: blob.type, upsert: false });
      if (error) {
        setUploadError("Não foi possível enviar a foto. Confira se o 07_portal_cliente.sql foi rodado e tente de novo.");
        return;
      }
      const fd = new FormData();
      fd.set("motelId", motelId);
      fd.set("suiteId", suiteId);
      fd.set("path", path);
      startTransition(() => register(fd));
    } catch {
      setUploadError("Não foi possível ler essa imagem. Tente outra foto.");
    } finally {
      setBusy(false);
    }
  };

  const act = (fn: (fd: FormData) => void, photoId: string, confirmText?: string) => () => {
    if (confirmText && !window.confirm(confirmText)) return;
    const fd = new FormData();
    fd.set("motelId", motelId);
    fd.set("suiteId", suiteId);
    fd.set("photoId", photoId);
    startTransition(() => fn(fd));
  };

  return (
    <div className="photo-manager">
      <ul className="photo-grid">
        {photos.map((p, i) => (
          <li key={p.id} className={i === 0 ? "cover" : undefined}>
            {/* eslint-disable-next-line @next/next/no-img-element -- miniatura do Storage */}
            <img src={p.url} alt={`Foto ${i + 1}`} loading="lazy" />
            {i === 0 ? <span className="photo-badge">Capa</span> : (
              <button type="button" className="photo-btn left" onClick={act(cover, p.id)} aria-label={`Usar a foto ${i + 1} como capa`}>★</button>
            )}
            <button type="button" className="photo-btn" onClick={act(remove, p.id, "Apagar esta foto?")} disabled={removing} aria-label={`Apagar a foto ${i + 1}`}>×</button>
          </li>
        ))}
        {photos.length < MAX_PHOTOS && (
          <li className="photo-add">
            <button type="button" onClick={() => inputRef.current?.click()} disabled={busy}>
              {busy ? "Enviando…" : "+ Foto"}
            </button>
            <input ref={inputRef} type="file" accept="image/*" hidden onChange={onFile} aria-label="Enviar foto da suíte" />
          </li>
        )}
      </ul>
      {msg?.error && <p className="alert error" role="alert">{msg.error}</p>}
    </div>
  );
}
