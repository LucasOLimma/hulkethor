import type * as THREE from "three";

// Tipos compartilhados pelo visualizador 3D.
// Uma "cena de suite" pode vir da suite demonstrativa (feita em codigo)
// ou, na proxima etapa, de um modelo .glb enviado pelo motel.

export type LightSceneId = "aconchegante" | "romantico" | "claro";

export type CameraPreset = {
  id: string;
  label: string;
  position: [number, number, number];
  target: [number, number, number];
};

export type HotspotDef = {
  id: string;
  title: string;
  text: string;
  position: [number, number, number];
};

export type SuiteScene = {
  /** Diz se o ponto de interesse deve aparecer (ex.: parede escondida). */
  isHotspotVisible?: (id: string) => boolean;
  root: THREE.Object3D;
  hotspots: HotspotDef[];
  presets: CameraPreset[];
  setLightScene: (id: LightSceneId) => void;
  getExposure: () => number;
  update: (timeSeconds: number, camera: THREE.Camera) => void;
  /** Limites por onde o "alvo" da camera pode andar (fica dentro do quarto). */
  bounds: THREE.Box3;
};

// Dados exibidos no painel lateral (vem do banco nas proximas etapas).
export type SuiteInfo = {
  name: string;
  type: string;
  capacity: number;
  description: string;
  amenities: string[];
  prices: { label: string; value: string }[];
  photos: string[];
};

// ---------- Tour 360 com fotos reais ----------
// Cada "ambiente" e uma foto panoramica 360 (formato equirretangular, 2:1).
// Angulos em GRAUS: yaw 0 = centro da foto, positivo para a direita;
// pitch 0 = horizonte, positivo para cima.

export type TourHotspot =
  | { kind: "info"; id: string; yaw: number; pitch: number; title: string; text: string }
  | { kind: "link"; id: string; yaw: number; pitch: number; to: string; label: string };

export type TourScene = {
  id: string;
  label: string;
  /** Endereco da foto 360 (ex.: /tour/demo/quarto.jpg) */
  image: string;
  /** Para onde a visao aponta ao entrar no ambiente */
  yaw?: number;
  pitch?: number;
  hotspots: TourHotspot[];
};

export type Tour = { scenes: TourScene[]; start?: string };
