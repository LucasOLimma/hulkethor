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
