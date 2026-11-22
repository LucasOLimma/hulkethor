import * as THREE from "three";
import { GLTFLoader } from "three/examples/jsm/loaders/GLTFLoader.js";
import type { CameraPreset, HotspotDef, LightSceneId, SuiteScene } from "../types";
import {
  applyBoxUV,
  bathtub,
  cushion,
  curtain,
  drapedSheet,
  fbm,
  rippleNormalTexture,
  roundedRect,
  tuftedPanel,
} from "./geometry";

// =====================================================================
// SUITE DEMONSTRATIVA REALISTA (medidas reais, em metros)
// Quarto 7 m x 6 m, pe-direito 2,90 m, com sanca de LED.
//   Fundo (z = -3): cama king + cabeceira capitone + painel de madeira
//   Fundo-direita: hidromassagem embutida em deque de marmore
//   Frente (z = +3): rack + TV 65"      Direita: cortinas + poltronas
//   Esquerda: espelho ao lado da cama e porta de entrada
// Modelos, texturas PBR e HDRI: Poly Haven (CC0) em /public/suite3d.
// =====================================================================

const W = 7;
const D = 6;
const H = 2.9;
const BASE = "/suite3d";

type Quality = "high" | "low";

export type RealisticSuite = SuiteScene & {
  /** Promessa que termina quando todos os moveis (modelos) carregaram. */
  modelsReady: Promise<void>;
  /** A camera esta dentro do quarto? (o modo fotografico so funciona dentro) */
  isInside: (p: THREE.Vector3) => boolean;
  /** Area onde da para "andar" no modo exploracao. */
  walkBounds: THREE.Box3;
  eyeHeight: number;
};

export async function buildRealisticSuite(opts: {
  quality: Quality;
  onProgress?: (loaded: number, total: number) => void;
  renderer: THREE.WebGLRenderer;
}): Promise<RealisticSuite> {
  const high = opts.quality === "high";
  const maxAniso = opts.renderer.capabilities.getMaxAnisotropy();

  // ---------- carregamento com progresso ----------
  const manager = new THREE.LoadingManager();
  manager.onProgress = (_url, loaded, total) => opts.onProgress?.(loaded, total);
  const texLoader = new THREE.TextureLoader(manager);
  const gltfLoader = new GLTFLoader(manager);

  const loadTex = (path: string, color: boolean) =>
    texLoader.loadAsync(`${BASE}/textures/${path}`).then((t) => {
      t.wrapS = t.wrapT = THREE.RepeatWrapping;
      t.colorSpace = color ? THREE.SRGBColorSpace : THREE.NoColorSpace;
      t.anisotropy = Math.min(high ? 8 : 4, maxAniso);
      return t;
    });
  const pbr = async (id: string) => {
    const [map, normalMap, roughnessMap] = await Promise.all([
      loadTex(`${id}/diffuse.webp`, true),
      loadTex(`${id}/nor_gl.webp`, false),
      loadTex(`${id}/rough.webp`, false),
    ]);
    return { map, normalMap, roughnessMap };
  };

  const [parquet, marble, plaster, velvet, linen, darkWood] = await Promise.all([
    pbr("rectangular_parquet"),
    pbr("marble_01"),
    pbr("plastered_wall_04"),
    pbr("velour_velvet"),
    pbr("rough_linen"),
    pbr("dark_wood"),
  ]);

  // ---------- materiais (PBR) ----------
  const M = {
    floor: new THREE.MeshPhysicalMaterial({ ...parquet, color: "#b89a7c", roughness: 1, normalScale: new THREE.Vector2(0.8, 0.8), clearcoat: 0.25, clearcoatRoughness: 0.35 }),
    marble: new THREE.MeshPhysicalMaterial({ ...marble, color: "#ffffff", roughness: 1, clearcoat: 0.6, clearcoatRoughness: 0.08 }),
    plaster: new THREE.MeshStandardMaterial({ ...plaster, color: "#cbbcab", roughness: 1, normalScale: new THREE.Vector2(0.4, 0.4) }),
    ceiling: new THREE.MeshStandardMaterial({ ...plaster, color: "#e9e2d8", roughness: 1, normalScale: new THREE.Vector2(0.2, 0.2) }),
    darkWood: new THREE.MeshPhysicalMaterial({ ...darkWood, color: "#8a6a55", roughness: 1, clearcoat: 0.3, clearcoatRoughness: 0.4 }),
    velvetHead: new THREE.MeshPhysicalMaterial({ ...velvet, color: "#3a2224", roughness: 1, sheen: 1, sheenColor: new THREE.Color("#a56a6f"), sheenRoughness: 0.45 }),
    velvetRunner: new THREE.MeshPhysicalMaterial({ ...velvet, color: "#5a1f2a", roughness: 1, sheen: 1, sheenColor: new THREE.Color("#c27a84"), sheenRoughness: 0.4, side: THREE.DoubleSide }),
    linen: new THREE.MeshPhysicalMaterial({ ...linen, color: "#f4f1ec", roughness: 1, sheen: 0.6, sheenColor: new THREE.Color("#ffffff"), sheenRoughness: 0.8, side: THREE.DoubleSide }),
    rug: new THREE.MeshStandardMaterial({ ...linen, color: "#a8957f", roughness: 1 }),
    curtain: new THREE.MeshPhysicalMaterial({ ...velvet, color: "#6b5a4c", roughness: 1, sheen: 0.8, sheenColor: new THREE.Color("#b8a48f"), sheenRoughness: 0.6, side: THREE.DoubleSide }),
    acrylic: new THREE.MeshPhysicalMaterial({ color: "#f7f6f3", roughness: 0.12, clearcoat: 1, clearcoatRoughness: 0.04 }),
    chrome: new THREE.MeshStandardMaterial({ color: "#d8d8d8", metalness: 1, roughness: 0.08 }),
    bronze: new THREE.MeshStandardMaterial({ color: "#8c6a42", metalness: 1, roughness: 0.32 }),
    mirror: new THREE.MeshStandardMaterial({ color: "#e8e8e8", metalness: 1, roughness: 0.015 }),
    tvFrame: new THREE.MeshStandardMaterial({ color: "#0d0d0e", metalness: 0.4, roughness: 0.35 }),
    tvScreen: new THREE.MeshPhysicalMaterial({ color: "#020203", roughness: 0.06, clearcoat: 1, clearcoatRoughness: 0.02 }),
    water: new THREE.MeshPhysicalMaterial({
      color: "#e7f6f8",
      roughness: 0.02,
      transmission: 1,
      ior: 1.33,
      thickness: 0.35,
      attenuationColor: new THREE.Color("#5fb9c9"),
      attenuationDistance: 0.9,
      normalMap: rippleNormalTexture(),
      normalScale: new THREE.Vector2(0.25, 0.25),
    }),
    candle: new THREE.MeshPhysicalMaterial({ color: "#f3ece0", roughness: 0.5, transmission: 0.25, thickness: 0.05 }),
  };
  // LEDs e chamas: materiais que emitem luz (a cor muda com o "clima")
  const ledMat = new THREE.MeshStandardMaterial({ color: "#000", emissive: "#ffb36b", emissiveIntensity: 6 });
  const flameMat = new THREE.MeshStandardMaterial({ color: "#000", emissive: "#ffb24a", emissiveIntensity: 12 });

  const root = new THREE.Group();
  const shadow = (o: THREE.Object3D) => {
    o.traverse((c) => {
      if ((c as THREE.Mesh).isMesh) {
        c.castShadow = true;
        c.receiveShadow = true;
      }
    });
    return o;
  };
  const mesh = (geo: THREE.BufferGeometry, mat: THREE.Material, pos: [number, number, number], rot?: [number, number, number]) => {
    const m = new THREE.Mesh(geo, mat);
    m.position.set(...pos);
    if (rot) m.rotation.set(...rot);
    m.castShadow = true;
    m.receiveShadow = true;
    return m;
  };
  /** caixa com textura na escala real (metros por repeticao) */
  const tbox = (w: number, h: number, d: number, mat: THREE.Material, pos: [number, number, number], mpr = 2) =>
    mesh(applyBoxUV(new THREE.BoxGeometry(w, h, d), mpr), mat, pos);

  // ---------- paredes em grupos (somem na "vista de maquete") ----------
  const walls = {
    back: new THREE.Group(),
    front: new THREE.Group(),
    left: new THREE.Group(),
    right: new THREE.Group(),
    ceiling: new THREE.Group(),
  };
  Object.values(walls).forEach((g) => root.add(g));

  const wallPlane = (w: number, h: number, mat: THREE.Material, mpr: number) => {
    const g = applyBoxUV(new THREE.PlaneGeometry(w, h), mpr);
    const m = new THREE.Mesh(g, mat);
    m.receiveShadow = true;
    return m;
  };

  // piso de madeira
  const floor = new THREE.Mesh(applyBoxUV(new THREE.PlaneGeometry(W, D).rotateX(-Math.PI / 2), 2.2), M.floor);
  floor.receiveShadow = true;
  root.add(floor);

  // paredes de gesso texturizado
  const back = wallPlane(W, H, M.plaster, 2.5);
  back.position.set(0, H / 2, -D / 2);
  walls.back.add(back);
  const front = wallPlane(W, H, M.plaster, 2.5);
  front.position.set(0, H / 2, D / 2);
  front.rotation.y = Math.PI;
  walls.front.add(front);
  const left = wallPlane(D, H, M.plaster, 2.5);
  left.position.set(-W / 2, H / 2, 0);
  left.rotation.y = Math.PI / 2;
  walls.left.add(left);
  const right = wallPlane(D, H, M.plaster, 2.5);
  right.position.set(W / 2, H / 2, 0);
  right.rotation.y = -Math.PI / 2;
  walls.right.add(right);

  // teto com forro rebaixado (sanca) — a luz indireta sai pela fresta
  const ceil = wallPlane(W, D, M.ceiling, 3);
  ceil.position.set(0, H, 0);
  ceil.rotation.x = Math.PI / 2;
  walls.ceiling.add(ceil);
  const inset = 0.42;
  const drop = mesh(applyBoxUV(new THREE.BoxGeometry(W - inset * 2, 0.12, D - inset * 2), 3), M.ceiling, [0, H - 0.17, 0]);
  walls.ceiling.add(drop);
  // fita de LED escondida na sanca (visivel so de baixo, como na vida real)
  const covePath = [
    [0, -D / 2 + inset - 0.02, W - inset * 2, 0.02],
    [0, D / 2 - inset + 0.02, W - inset * 2, 0.02],
  ];
  for (const [x, z, w, d] of covePath) walls.ceiling.add(mesh(new THREE.BoxGeometry(w, 0.012, d), ledMat, [x, H - 0.105, z]));
  for (const sx of [-1, 1]) walls.ceiling.add(mesh(new THREE.BoxGeometry(0.02, 0.012, D - inset * 2), ledMat, [sx * (W / 2 - inset + 0.02), H - 0.105, 0]));

  // rodapes
  const skirt = new THREE.MeshStandardMaterial({ color: "#2a211c", roughness: 0.5 });
  walls.back.add(mesh(new THREE.BoxGeometry(W, 0.1, 0.015), skirt, [0, 0.05, -D / 2 + 0.008]));
  walls.front.add(mesh(new THREE.BoxGeometry(W, 0.1, 0.015), skirt, [0, 0.05, D / 2 - 0.008]));
  walls.left.add(mesh(new THREE.BoxGeometry(0.015, 0.1, D), skirt, [-W / 2 + 0.008, 0.05, 0]));
  walls.right.add(mesh(new THREE.BoxGeometry(0.015, 0.1, D), skirt, [W / 2 - 0.008, 0.05, 0]));

  // ================= CAMA =================
  const bedX = -0.6;
  const bedLen = 2.03; // king brasileiro 1,93 x 2,03
  const bedWid = 1.93;
  const bedZ = -D / 2 + 0.12 + bedLen / 2 + 0.06;

  // painel de madeira atras da cama (parede de destaque)
  const panel = mesh(applyBoxUV(new THREE.BoxGeometry(3.6, H - 0.12, 0.04), 1.2), M.darkWood, [bedX, (H - 0.12) / 2, -D / 2 + 0.02]);
  walls.back.add(panel);
  // cabeceira capitone em veludo
  const head = tuftedPanel(2.5, 1.2, 0.075);
  const headMesh = mesh(head.geometry, M.velvetHead, [bedX, 1.08, -D / 2 + 0.06]);
  walls.back.add(headMesh);
  for (const b of head.buttons) {
    walls.back.add(mesh(new THREE.SphereGeometry(0.011, 10, 8), M.velvetHead, [bedX + b.x, 1.08 + b.y, -D / 2 + 0.06 + 0.075 * 0.45]));
  }
  // luz indireta sobre o painel (fita escondida no topo da cabeceira)
  walls.back.add(mesh(new THREE.BoxGeometry(2.4, 0.012, 0.012), ledMat, [bedX, 1.7, -D / 2 + 0.05]));

  const bed = new THREE.Group();
  // base em madeira, recuada, com LED por baixo ("cama flutuante")
  bed.add(tbox(bedWid + 0.06, 0.26, bedLen + 0.04, M.darkWood, [bedX, 0.19, bedZ], 1.2));
  bed.add(mesh(new THREE.BoxGeometry(bedWid - 0.2, 0.05, bedLen - 0.2), new THREE.MeshStandardMaterial({ color: "#111" }), [bedX, 0.03, bedZ]));
  bed.add(mesh(new THREE.BoxGeometry(bedWid - 0.24, 0.01, 0.01), ledMat, [bedX, 0.06, bedZ + bedLen / 2 - 0.12]));
  // colchao (com volume e cantos macios)
  const mattressTop = 0.32 + 0.3;
  bed.add(mesh(cushion(bedWid / 2, 0.15, bedLen / 2, { e1: 0.16, e2: 0.07, wrinkle: 0.0015 }), M.linen, [bedX, mattressTop - 0.15, bedZ]));
  // edredom branco com dobras, caindo pelas laterais e pelo pe
  const duvetZ0 = bedZ - bedLen / 2 + 0.55;
  const duvetLen = bedLen - 0.55;
  const duvet = drapedSheet({ width: bedWid + 0.02, depth: duvetLen, drop: 0.3, frontDrop: 0.32, seed: 5 });
  bed.add(mesh(duvet, M.linen, [bedX, mattressTop + 0.012, duvetZ0 + duvetLen / 2]));
  // dobra do edredom (barra virada perto dos travesseiros)
  bed.add(mesh(cushion(bedWid / 2 + 0.02, 0.03, 0.09, { e1: 0.5, e2: 0.12, wrinkle: 0.006, seed: 8 }), M.linen, [bedX, mattressTop + 0.035, duvetZ0 + 0.04]));
  // peseira de veludo
  const runner = drapedSheet({ width: bedWid + 0.02, depth: 0.55, drop: 0.24, frontDrop: 0.26, seed: 9, wrinkle: 0.006, outset: 0.018 });
  bed.add(mesh(runner, M.velvetRunner, [bedX, mattressTop + 0.028, bedZ + bedLen / 2 - 0.275]));
  // travesseiros (2 fileiras) + almofadas de veludo
  const pillowZ = bedZ - bedLen / 2 + 0.3;
  for (let i = 0; i < 2; i++) {
    const px = bedX - 0.46 + i * 0.92;
    // travesseiro: centro cheio e bordas que afinam (e1 alto), cantos macios
    bed.add(mesh(cushion(0.37, 0.1, 0.26, { e1: 0.8, e2: 0.32, seed: 20 + i, wrinkle: 0.01 }), M.linen, [px, mattressTop + 0.17, pillowZ - 0.06], [-1.0, 0, (i ? 1 : -1) * 0.05]));
    bed.add(mesh(cushion(0.36, 0.095, 0.25, { e1: 0.8, e2: 0.32, seed: 30 + i, wrinkle: 0.01 }), M.linen, [px, mattressTop + 0.08, pillowZ + 0.14], [-0.28, 0, (i ? -1 : 1) * 0.03]));
    bed.add(mesh(cushion(0.22, 0.075, 0.21, { e1: 0.75, e2: 0.35, seed: 40 + i, wrinkle: 0.006 }), M.velvetRunner, [bedX - 0.2 + i * 0.4, mattressTop + 0.12, pillowZ + 0.32], [-0.55, 0, 0]));
  }
  root.add(bed);

  // tapete sob a cama
  root.add(tbox(3.0, 0.014, 2.5, M.rug, [bedX, 0.007, bedZ + 0.55], 1.5));

  // espelho grande ao lado da cama (parede esquerda), com moldura de bronze
  const mirrorZ = -1.55;
  walls.left.add(tbox(0.03, 2.06, 1.16, M.bronze, [-W / 2 + 0.015, 1.15, mirrorZ]));
  walls.left.add(mesh(new THREE.PlaneGeometry(1.08, 1.98), M.mirror, [-W / 2 + 0.032, 1.15, mirrorZ], [0, Math.PI / 2, 0]));

  // porta de entrada (parede esquerda, frente)
  const doorZ = 1.75;
  walls.left.add(tbox(0.06, 2.25, 1.02, M.darkWood, [-W / 2 + 0.03, 1.125, doorZ], 1));
  walls.left.add(tbox(0.04, 2.33, 0.05, M.bronze, [-W / 2 + 0.02, 1.165, doorZ - 0.535]));
  walls.left.add(tbox(0.04, 2.33, 0.05, M.bronze, [-W / 2 + 0.02, 1.165, doorZ + 0.535]));
  walls.left.add(tbox(0.04, 0.05, 1.12, M.bronze, [-W / 2 + 0.02, 2.33, doorZ]));
  walls.left.add(mesh(new THREE.CylinderGeometry(0.012, 0.012, 0.32, 16), M.bronze, [-W / 2 + 0.1, 1.05, doorZ + 0.38]));

  // ================= TV + RACK (parede da frente) =================
  const tvWall = mesh(applyBoxUV(new THREE.BoxGeometry(3.2, H - 0.12, 0.04), 1.2), M.darkWood, [bedX, (H - 0.12) / 2, D / 2 - 0.02]);
  walls.front.add(tvWall);
  walls.front.add(tbox(1.46, 0.84, 0.035, M.tvFrame, [bedX, 1.42, D / 2 - 0.06]));
  walls.front.add(mesh(new THREE.PlaneGeometry(1.43, 0.81), M.tvScreen, [bedX, 1.42, D / 2 - 0.079], [0, Math.PI, 0]));

  // ================= HIDROMASSAGEM =================
  const deckX0 = 1.45; // borda do deque
  const deckW = W / 2 - deckX0;
  const deckD = 2.5;
  const deckH = 0.52;
  const tubX = deckX0 + deckW / 2;
  const tubZ = -D / 2 + deckD / 2;
  const tubW = 1.75;
  const tubDp = 1.3;
  // revestimento de marmore nas paredes da area molhada
  const bw = wallPlane(deckW + 0.02, H, M.marble, 2.4);
  bw.position.set(tubX, H / 2, -D / 2 + 0.006);
  walls.back.add(bw);
  const rw = wallPlane(deckD + 0.02, H, M.marble, 2.4);
  rw.position.set(W / 2 - 0.006, H / 2, tubZ);
  rw.rotation.y = -Math.PI / 2;
  walls.right.add(rw);
  // deque com abertura para a banheira
  const deckShape = new THREE.Shape();
  deckShape.moveTo(-deckW / 2, -deckD / 2);
  deckShape.lineTo(deckW / 2, -deckD / 2);
  deckShape.lineTo(deckW / 2, deckD / 2);
  deckShape.lineTo(-deckW / 2, deckD / 2);
  deckShape.lineTo(-deckW / 2, -deckD / 2);
  deckShape.holes.push(roundedRect(tubW, tubDp, 0.16, true) as THREE.Path);
  const deckGeo = new THREE.ExtrudeGeometry(deckShape, { depth: deckH, bevelEnabled: false, curveSegments: 24 });
  deckGeo.rotateX(-Math.PI / 2);
  root.add(mesh(applyBoxUV(deckGeo, 2.4), M.marble, [tubX, 0, tubZ]));
  // degrau de marmore com LED sob o bocal
  const stepD = 0.36;
  root.add(tbox(deckW, 0.18, stepD, M.marble, [tubX, 0.09, tubZ + deckD / 2 + stepD / 2], 2.4));
  root.add(mesh(new THREE.BoxGeometry(deckW - 0.04, 0.01, 0.01), ledMat, [tubX, 0.012, tubZ + deckD / 2 + stepD + 0.004]));

  // banheira (acrilico) com borda, bacia e fundo
  const tub = bathtub({ width: tubW, depth: tubDp, height: 0.44, wall: 0.11, radius: 0.16 });
  const tubGroup = new THREE.Group();
  tubGroup.position.set(tubX, deckH, tubZ);
  tubGroup.add(mesh(tub.rim, M.acrylic, [0, 0, 0]));
  const basinMat = M.acrylic.clone();
  basinMat.side = THREE.DoubleSide;
  tubGroup.add(mesh(tub.basin, basinMat, [0, -0.01, 0]));
  tubGroup.add(mesh(tub.floor, M.acrylic, [0, -0.01, 0]));
  // jatos de hidromassagem (anel cromado + bocal escuro) nas paredes internas
  const jetMat = new THREE.MeshStandardMaterial({ color: "#1a1a1a", roughness: 0.4 });
  const jets: [number, number, number][] = [];
  for (const sx of [-0.55, 0, 0.55]) jets.push([sx * (tub.innerW / 2), -0.2, -tub.innerD / 2 + 0.03]);
  for (const sz of [-0.4, 0.4]) jets.push([-tub.innerW / 2 + 0.03, -0.22, sz * (tub.innerD / 2)], [tub.innerW / 2 - 0.03, -0.22, sz * (tub.innerD / 2)]);
  for (const [jx, jy, jz] of jets) {
    // o jato "olha" para o centro da banheira
    const rotY = Math.abs(jz) > Math.abs(jx) ? 0 : (jx < 0 ? Math.PI / 2 : -Math.PI / 2);
    tubGroup.add(mesh(new THREE.TorusGeometry(0.028, 0.007, 12, 28), M.chrome, [jx, jy, jz], [0, rotY, 0]));
    tubGroup.add(mesh(new THREE.SphereGeometry(0.02, 16, 12), jetMat, [jx, jy, jz]));
  }
  // agua com transparencia e reflexo
  const water = mesh(new THREE.PlaneGeometry(tub.innerW - 0.06, tub.innerD - 0.06), M.water, [0, -0.11, 0], [-Math.PI / 2, 0, 0]);
  water.castShadow = false;
  tubGroup.add(water);
  // torneira cascata cromada no deque
  tubGroup.add(tbox(0.22, 0.05, 0.12, M.chrome, [0, 0.025, -tubDp / 2 - 0.12], 1));
  tubGroup.add(tbox(0.18, 0.012, 0.16, M.chrome, [0, 0.055, -tubDp / 2 - 0.06], 1));
  root.add(tubGroup);
  // toalhas enroladas e velas no deque
  for (let i = 0; i < 3; i++) {
    const towel = mesh(new THREE.CylinderGeometry(0.075, 0.075, 0.34, 32), M.linen, [deckX0 + 0.16, deckH + 0.075 + (i === 2 ? 0.13 : 0), tubZ + deckD / 2 - 0.25 - (i % 2) * 0.16 - (i === 2 ? 0.08 : 0)], [0, 0, Math.PI / 2]);
    root.add(towel);
  }
  const candles: THREE.PointLight[] = [];
  for (let i = 0; i < 3; i++) {
    const cx = W / 2 - 0.22 - i * 0.11;
    const cz = -D / 2 + 0.2 + (i % 2) * 0.08;
    const ch = 0.09 + i * 0.03;
    root.add(mesh(new THREE.CylinderGeometry(0.035, 0.035, ch, 24), M.candle, [cx, deckH + ch / 2, cz]));
    const flame = mesh(new THREE.SphereGeometry(0.008, 10, 8), flameMat, [cx, deckH + ch + 0.012, cz]);
    flame.scale.set(1, 2.2, 1);
    flame.castShadow = false;
    root.add(flame);
    const l = new THREE.PointLight("#ffa040", 0.25, 1.6, 2);
    l.position.set(cx, deckH + ch + 0.03, cz);
    candles.push(l);
    root.add(l);
  }

  // ================= CORTINAS (parede direita, frente) =================
  const curtainZ = 1.45;
  const cw = 2.6;
  walls.right.add(tbox(0.06, 0.05, cw + 0.2, M.bronze, [W / 2 - 0.12, H - 0.25, curtainZ]));
  for (const side of [-1, 1]) {
    const c = mesh(curtain(cw / 2 + 0.35, H - 0.3, 9, 0.055, side > 0 ? 3 : 7), M.curtain, [W / 2 - 0.13, (H - 0.3) / 2 + 0.005, curtainZ + side * (cw / 4 + 0.05)], [0, -Math.PI / 2, 0]);
    walls.right.add(c);
  }

  // ================= LUZES =================
  const ledLights: THREE.RectAreaLight[] = [];
  const rect = (w: number, h: number, pos: [number, number, number], look: [number, number, number], intensity: number) => {
    const l = new THREE.RectAreaLight("#ffb36b", intensity, w, h);
    l.position.set(...pos);
    l.lookAt(...look);
    l.userData.base = intensity;
    ledLights.push(l);
    root.add(l); // fora do grupo do teto: continua acesa na vista de cima
    return l;
  };
  // sanca: a luz sobe e "lava" o teto e o alto das paredes
  rect(W - inset * 2, 0.18, [0, H - 0.1, -D / 2 + inset - 0.12], [0, H + 1, -D / 2 - 0.4], 7);
  rect(W - inset * 2, 0.18, [0, H - 0.1, D / 2 - inset + 0.12], [0, H + 1, D / 2 + 0.4], 7);
  rect(D - inset * 2, 0.18, [-W / 2 + inset - 0.12, H - 0.1, 0], [-W / 2 - 0.4, H + 1, 0], 7);
  rect(D - inset * 2, 0.18, [W / 2 - inset + 0.12, H - 0.1, 0], [W / 2 + 0.4, H + 1, 0], 7);
  // luz escondida sobre a cabeceira (banha o painel de madeira)
  const headWash = new THREE.RectAreaLight("#ffb36b", 10, 2.3, 0.08);
  headWash.position.set(bedX, 1.71, -D / 2 + 0.08);
  headWash.lookAt(bedX, 3.5, -D / 2 - 0.2);
  headWash.userData.base = 10;
  ledLights.push(headWash);
  root.add(headWash);

  // spots embutidos no forro (luz de destaque com sombra)
  const spots: THREE.SpotLight[] = [];
  const spot = (x: number, z: number, target: [number, number, number], intensity: number, castShadow: boolean) => {
    const s = new THREE.SpotLight("#ffd2a1", intensity, 9, 0.55, 0.85, 2);
    s.position.set(x, H - 0.24, z);
    s.target.position.set(...target);
    s.castShadow = castShadow && high;
    if (s.castShadow) {
      s.shadow.mapSize.set(1024, 1024);
      s.shadow.bias = -0.0002;
      s.shadow.normalBias = 0.02;
      s.shadow.radius = 6;
    }
    s.userData.base = intensity;
    spots.push(s);
    root.add(s, s.target);
    walls.ceiling.add(mesh(new THREE.CylinderGeometry(0.05, 0.05, 0.012, 24), new THREE.MeshStandardMaterial({ color: "#000", emissive: "#fff1dc", emissiveIntensity: 4 }), [x, H - 0.236, z]));
    return s;
  };
  spot(bedX, bedZ + 0.4, [bedX, 0.6, bedZ + 0.4], 18, true);
  spot(tubX, tubZ, [tubX, deckH, tubZ], 14, true);
  spot(2.35, 1.45, [2.35, 0.4, 1.45], 10, false);
  spot(bedX, 2.0, [bedX, 1.4, D / 2], 8, false);

  // luzes dos pendentes ao lado da cama (dentro dos globos de vidro)
  const lampLights: THREE.PointLight[] = [];
  for (const sx of [-1, 1]) {
    const l = new THREE.PointLight("#ffc98f", 1.6, 4, 2);
    l.position.set(bedX + sx * 1.38, 1.75, -D / 2 + 0.32);
    l.userData.base = 1.6;
    lampLights.push(l);
    root.add(l);
  }
  // cromoterapia discreta sob a agua
  const tubLight = new THREE.PointLight("#7fd3e0", 0.8, 2.2, 2);
  tubLight.position.set(tubX, deckH - 0.3, tubZ);
  root.add(tubLight);

  // preenchimento suave so para a renderizacao rapida (o modo fotografico
  // calcula a luz que rebate de verdade e ignora esta luz)
  const fill = new THREE.HemisphereLight("#ffe7cf", "#3a2a20", high ? 0.35 : 0.55);
  root.add(fill);

  // ================= MOVEIS (modelos reais) =================
  const placeModel = async (
    id: string,
    o: { x: number; z: number; y?: number; rotY?: number; scale?: number; fitWidth?: number; hangFrom?: number },
  ) => {
    const gltf = await gltfLoader.loadAsync(`${BASE}/models/${id}/${id}.gltf`);
    const obj = gltf.scene;
    obj.traverse((c) => {
      const m = c as THREE.Mesh;
      if (m.isMesh) {
        m.castShadow = true;
        m.receiveShadow = true;
        const mats = Array.isArray(m.material) ? m.material : [m.material];
        for (const mat of mats) {
          for (const key of ["map", "normalMap", "roughnessMap", "metalnessMap", "aoMap"] as const) {
            const t = (mat as THREE.MeshStandardMaterial)[key];
            if (t) t.anisotropy = Math.min(high ? 8 : 4, maxAniso);
          }
        }
      }
    });
    obj.rotation.y = o.rotY ?? 0;
    const box = new THREE.Box3().setFromObject(obj);
    const size = box.getSize(new THREE.Vector3());
    const scale = o.scale ?? (o.fitWidth ? o.fitWidth / Math.max(size.x, size.z) : 1);
    obj.scale.setScalar(scale);
    const b2 = new THREE.Box3().setFromObject(obj);
    const c = b2.getCenter(new THREE.Vector3());
    obj.position.x += o.x - c.x;
    obj.position.z += o.z - c.z;
    obj.position.y += o.hangFrom !== undefined ? o.hangFrom - b2.max.y : (o.y ?? 0) - b2.min.y;
    root.add(obj);
    return obj;
  };

  const modelsReady = Promise.all([
    placeModel("side_table_01", { x: bedX - 1.4, z: -D / 2 + 0.34 }),
    placeModel("side_table_01", { x: bedX + 1.4, z: -D / 2 + 0.34 }),
    placeModel("modern_ceiling_lamp_01", { x: bedX - 1.38, z: -D / 2 + 0.32, hangFrom: H - 0.11 }),
    placeModel("modern_ceiling_lamp_01", { x: bedX + 1.38, z: -D / 2 + 0.32, hangFrom: H - 0.11 }),
    placeModel("Ottoman_01", { x: bedX, z: bedZ + bedLen / 2 + 0.55, fitWidth: 1.1 }),
    placeModel("modern_wooden_cabinet", { x: bedX, z: D / 2 - 0.3, rotY: Math.PI, fitWidth: 2.2 }),
    placeModel("ceramic_vase_01", { x: bedX + 0.75, z: D / 2 - 0.3, y: 0.58, scale: 0.9 }),
    placeModel("modern_arm_chair_01", { x: 2.35, z: 0.55, rotY: 0 }),
    placeModel("modern_arm_chair_01", { x: 2.35, z: 2.35, rotY: Math.PI }),
    placeModel("coffee_table_round_01", { x: 2.35, z: 1.45, fitWidth: 0.8 }),
    placeModel("potted_plant_02", { x: -W / 2 + 0.45, z: D / 2 - 0.5 }),
    placeModel("potted_plant_02", { x: deckX0 - 0.35, z: -D / 2 + 0.4, scale: 0.85 }),
  ]).then(() => undefined);

  shadow(bed);

  // ================= CLIMAS DE LUZ =================
  const SCENES: Record<LightSceneId, { led: string; ledK: number; warm: string; spotK: number; lampK: number; tub: string; tubK: number; exposure: number; fill: number }> = {
    aconchegante: { led: "#ffb36b", ledK: 1, warm: "#ffd2a1", spotK: 1, lampK: 1, tub: "#7fd3e0", tubK: 0.8, exposure: 1, fill: 1 },
    romantico: { led: "#ff7a6b", ledK: 0.8, warm: "#ffb08a", spotK: 0.35, lampK: 0.6, tub: "#c46a9a", tubK: 1.1, exposure: 1.05, fill: 0.55 },
    claro: { led: "#ffe2c2", ledK: 1.3, warm: "#fff0dc", spotK: 2.2, lampK: 1.2, tub: "#9fe0ea", tubK: 0.6, exposure: 1, fill: 1.8 },
  };
  let exposure = 1;
  const setLightScene = (id: LightSceneId) => {
    const s = SCENES[id];
    ledMat.emissive.set(s.led);
    ledMat.emissiveIntensity = 6 * s.ledK;
    for (const l of ledLights) {
      l.color.set(s.led);
      l.intensity = (l.userData.base as number) * s.ledK;
    }
    for (const sp of spots) {
      sp.color.set(s.warm);
      sp.intensity = (sp.userData.base as number) * s.spotK;
    }
    for (const l of lampLights) {
      l.color.set(s.warm);
      l.intensity = (l.userData.base as number) * s.lampK;
    }
    tubLight.color.set(s.tub);
    tubLight.intensity = s.tubK;
    fill.intensity = (high ? 0.35 : 0.55) * s.fill;
    exposure = s.exposure;
  };
  setLightScene("aconchegante");

  // ================= PONTOS DE INTERESSE E ANGULOS =================
  const hotspots: HotspotDef[] = [
    { id: "cama", title: "Cama king size", text: "Colchão king 1,93 × 2,03 m, enxoval branco de algodão, cabeceira capitonê em veludo e base com luz indireta.", position: [bedX, 0.95, bedZ - 0.3] },
    { id: "hidro", title: "Hidromassagem para 2", text: "Banheira com 7 jatos e cromoterapia, embutida em deque de mármore com degrau iluminado.", position: [tubX, deckH + 0.25, tubZ] },
    { id: "espelho", title: "Espelho decorativo", text: "Espelho de corpo inteiro com moldura em bronze, ao lado da cama.", position: [-W / 2 + 0.1, 1.6, mirrorZ] },
    { id: "tv", title: 'Smart TV 65"', text: "Painel em madeira, streaming e som ambiente integrado.", position: [bedX, 1.95, D / 2 - 0.2] },
    { id: "estar", title: "Espaço de estar", text: "Poltronas em couro e mesa de mármore, junto às cortinas.", position: [2.35, 1.05, 1.45] },
    { id: "luz", title: "Iluminação indireta", text: "Sanca de LED em todo o perímetro e luz sobre a cabeceira. Experimente os climas de luz.", position: [0.8, H - 0.3, -D / 2 + 0.6] },
    { id: "entrada", title: "Entrada privativa", text: "Acesso direto e discreto à suíte.", position: [-W / 2 + 0.25, 1.5, doorZ] },
  ];
  const presets: CameraPreset[] = [
    { id: "geral", label: "Visão geral", position: [5.6, 6.2, 7.2], target: [0, 0.5, 0] },
    { id: "cima", label: "Vista de cima", position: [0, 11.5, 0.01], target: [0, 0, 0] },
    { id: "entrada", label: "Entrada", position: [-2.9, 1.62, 2.4], target: [0.8, 1.0, -1.6] },
    { id: "cama", label: "Cama", position: [1.15, 1.5, 0.95], target: [bedX - 0.1, 0.75, bedZ - 0.3] },
    { id: "hidro", label: "Hidromassagem", position: [0.55, 1.65, 0.35], target: [tubX, deckH - 0.1, tubZ] },
    { id: "estar", label: "Estar e TV", position: [bedX - 0.2, 1.45, -0.6], target: [1.8, 0.9, 2.2] },
  ];
  const hotspotWall: Record<string, THREE.Group> = { tv: walls.front, entrada: walls.left, espelho: walls.left };

  // ================= ATUALIZACAO POR QUADRO =================
  const waterNormal = M.water.normalMap!;
  const update = (time: number, camera: THREE.Camera) => {
    const p = camera.position;
    walls.back.visible = p.z > -D / 2;
    walls.front.visible = p.z < D / 2;
    walls.left.visible = p.x > -W / 2;
    walls.right.visible = p.x < W / 2;
    walls.ceiling.visible = p.y < H;
    waterNormal.offset.set(time * 0.012, time * 0.008);
    for (let i = 0; i < candles.length; i++) {
      candles[i].intensity = 0.22 + 0.05 * (fbm(time * 3 + i * 10, i, 3, 2) + 0.5);
    }
  };

  const isInside = (v: THREE.Vector3) => Math.abs(v.x) < W / 2 - 0.05 && Math.abs(v.z) < D / 2 - 0.05 && v.y > 0.05 && v.y < H - 0.05;

  return {
    root,
    hotspots,
    presets,
    setLightScene,
    getExposure: () => exposure,
    update,
    isHotspotVisible: (id: string) => hotspotWall[id]?.visible ?? true,
    bounds: new THREE.Box3(new THREE.Vector3(-W / 2 + 0.3, 0.2, -D / 2 + 0.3), new THREE.Vector3(W / 2 - 0.3, H - 0.3, D / 2 - 0.3)),
    modelsReady,
    isInside,
    walkBounds: new THREE.Box3(new THREE.Vector3(-W / 2 + 0.35, 0, -D / 2 + 0.35), new THREE.Vector3(W / 2 - 0.35, H, D / 2 - 0.35)),
    eyeHeight: 1.6,
  };
}
