"use client";

import Image from "next/image";
import { useState } from "react";

// Fotografia do login. Se o arquivo ainda nao existir, simplesmente nao
// aparece (fica o fundo escuro neutro), sem icone de imagem quebrada.
export function LoginPhoto({ src }: { src: string }) {
  const [failed, setFailed] = useState(false);
  if (failed) return null;
  return (
    <Image
      src={src}
      alt=""
      fill
      priority
      quality={85}
      sizes="(max-width: 900px) 100vw, 65vw"
      className="auth-photo-img"
      onError={() => setFailed(true)}
    />
  );
}
