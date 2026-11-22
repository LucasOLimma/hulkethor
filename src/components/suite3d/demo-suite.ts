import * as THREE from "three";
import { RoundedBoxGeometry } from "three/examples/jsm/geometries/RoundedBoxGeometry.js";
import type { CameraPreset, HotspotDef, LightSceneId, SuiteScene } from "./types";

// =====================================================================
// SUITE DEMONSTRATIVA "IMPERIAL" — construida 100% em codigo (geometria
// real em 3D, nada de foto). Medidas em METROS.
//   Quarto: 8 m (x: -4..4) por 6 m (z: -3..3), pe-direito 3 m.
//   Fundo (z=-3): cama + cabeceira | Frente (z=3): TV + porta
//   Esquerda (x=-4): estar | Fundo-direita: hidromassagem
// =====================================================================

const W = 8;
const D = 6;
const H = 3;

// ---------- utilitarios ----------

// Numeros "aleatorios" sempre iguais (a suite fica identica a cada visita).
function rng(seed: number) {
  return () => {
    seed |= 0;
    seed = (seed + 0x6d2b79f5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function canvasTexture(
  size: number,
  draw: (ctx: CanvasRenderingContext2D, s: number) => void,
  repeat?: [number, number],
) {
  const canvas = document.createElement("canvas");
  canvas.width = canvas.height = size;
  const ctx = canvas.getContext("2d")!;
  draw(ctx, size);
  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  if (repeat) {
    tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
    tex.repeat.set(repeat[0], repeat[1]);
  }
  return tex;
}

function woodTexture(repeat: [number, number]) {
  const r = rng(7);
  return canvasTexture(
    1024,
    (ctx, s) => {
      const rows = 8;
      const h = s / rows;
      for (let i = 0; i < rows; i++) {
        let x = -r() * s * 0.5;
        while (x < s) {
          const len = s * (0.45 + r() * 0.4);
          const l = 22 + r() * 9;
          ctx.fillStyle = `hsl(${22 + r() * 6}, ${38 + r() * 10}%, ${l}%)`;
          ctx.fillRect(x, i * h, len, h);
          // veios
          for (let g = 0; g < 14; g++) {
            ctx.strokeStyle = `rgba(30,15,8,${0.08 + r() * 0.12})`;
            ctx.lineWidth = 1 + r() * 1.5;
            ctx.beginPath();
            const y0 = i * h + r() * h;
            ctx.moveTo(x, y0);
            for (let k = 0; k <= 8; k++) {
              ctx.lineTo(x + (len * k) / 8, y0 + Math.sin(k * 0.9 + g) * (2 + r() * 3));
            }
            ctx.stroke();
          }
          // junta entre tabuas
          ctx.fillStyle = "rgba(12,6,3,0.55)";
          ctx.fillRect(x, i * h, 3, h);
          x += len;
        }
        ctx.fillStyle = "rgba(12,6,3,0.6)";
        ctx.fillRect(0, i * h, s, 3);
      }
    },
    repeat,
  );
}

function marbleTexture(repeat: [number, number], dark = false) {
  const r = rng(dark ? 21 : 13);
  return canvasTexture(
    1024,
    (ctx, s) => {
      ctx.fillStyle = dark ? "#1d1a1b" : "#ece7e1";
      ctx.fillRect(0, 0, s, s);
      for (let v = 0; v < 22; v++) {
        const gold = r() < 0.22;
        ctx.strokeStyle = gold
          ? `rgba(200,160,90,${0.2 + r() * 0.3})`
          : dark
            ? `rgba(220,220,225,${0.05 + r() * 0.12})`
            : `rgba(110,104,104,${0.05 + r() * 0.14})`;
        ctx.lineWidth = 0.6 + r() * (gold ? 1.8 : 2.6);
        ctx.beginPath();
        let x = r() * s;
        let y = r() * s;
        ctx.moveTo(x, y);
        for (let k = 0; k < 5; k++) {
          const cx = x + (r() - 0.2) * s * 0.25;
          const cy = y + (r() - 0.5) * s * 0.2;
          x = cx + (r() - 0.2) * s * 0.2;
          y = cy + (r() - 0.5) * s * 0.15;
          ctx.quadraticCurveTo(cx, cy, x, y);
        }
        ctx.stroke();
      }
    },
    repeat,
  );
}

function std(
  color: THREE.ColorRepresentation,
  roughness = 0.6,
  metalness = 0,
  extra: THREE.MeshStandardMaterialParameters = {},
) {
  return new THREE.MeshStandardMaterial({ color, roughness, metalness, ...extra });
}

function box(
  w: number,
  h: number,
  d: number,
  mat: THREE.Material,
  pos: [number, number, number],
  radius = 0,
) {
  const geo =
    radius > 0
      ? new RoundedBoxGeometry(w, h, d, 3, Math.min(radius, w / 2, h / 2, d / 2))
      : new THREE.BoxGeometry(w, h, d);
  const m = new THREE.Mesh(geo, mat);
  m.position.set(...pos);
  m.castShadow = true;
  m.receiveShadow = true;
  return m;
}

function cyl(
  rt: number,
  rb: number,
  h: number,
  mat: THREE.Material,
  pos: [number, number, number],
  seg = 32,
) {
  const m = new THREE.Mesh(new THREE.CylinderGeometry(rt, rb, h, seg), mat);
  m.position.set(...pos);
  m.castShadow = true;
  m.receiveShadow = true;
  return m;
}

// ---------- cenas de iluminacao ----------

type SceneCfg = {
  led: string; // cor das fitas de LED
  ledI: number; // intensidade das fitas
  warm: string; // cor das luzes "brancas"
  spot: number;
  lamp: number;
  hemi: number;
  cromo: boolean; // cromoterapia na banheira
  exposure: number;
};

const SCENES: Record<LightSceneId, SceneCfg> = {
  aconchegante: { led: "#ffa45c", ledI: 1, warm: "#ffcf9e", spot: 1, lamp: 1, hemi: 1, cromo: false, exposure: 1.05 },
  romantico: { led: "#ff2a6d", ledI: 1.25, warm: "#ff9c86", spot: 0.3, lamp: 0.55, hemi: 0.45, cromo: true, exposure: 1 },
  claro: { led: "#fff0dc", ledI: 1.1, warm: "#fff6ea", spot: 2.2, lamp: 1.1, hemi: 2.6, cromo: false, exposure: 1.1 },
};

// ---------- a suite ----------

export function buildDemoSuite(opts: { quality: "high" | "low" }): SuiteScene {
  const high = opts.quality === "high";
  const root = new THREE.Group();

  // Materiais principais
  const woodFloor = std("#ffffff", 0.5, 0, { map: woodTexture([2.2, 1.65]) });
  const marble = std("#ffffff", 0.18, 0, { map: marbleTexture([1, 1]) });
  const marbleDark = std("#ffffff", 0.22, 0, { map: marbleTexture([1.4, 1], true) });
  const wallMat = std("#3b2b2f", 0.85);
  const wallWarm = std("#5a4740", 0.9);
  const ceilingMat = std("#171214", 0.9);
  const darkWood = std("#2a1a12", 0.45, 0, { map: woodTexture([0.6, 0.6]) });
  const walnut = std("#5b3a26", 0.42);
  const velvet = new THREE.MeshPhysicalMaterial({ color: "#5e1a2d", roughness: 0.9, sheen: 1, sheenColor: "#c2456f", sheenRoughness: 0.5 });
  const linen = std("#eee8df", 0.95);
  const runnerMat = std("#7a1f35", 0.9);
  const gold = std("#c9a25a", 0.28, 1);
  const leather = std("#8a4f2f", 0.55);
  const blackGloss = std("#0b0b0c", 0.15, 0.2);
  const porcelain = new THREE.MeshPhysicalMaterial({ color: "#f7f5f2", roughness: 0.12, clearcoat: 1, clearcoatRoughness: 0.05 });
  const mirrorMat = std("#ffffff", 0.03, 1);

  // Fitas de LED (materiais que "brilham"); a cor muda com a cena de luz.
  const ledMat = new THREE.MeshStandardMaterial({ color: "#000000", emissive: "#ffa45c", emissiveIntensity: 3 });

  // ---------- paredes em grupos ----------
  // Cada parede (e o que esta pendurado nela) e um grupo. Quando a camera
  // fica do lado de fora daquela parede, o grupo some: assim a "visao geral"
  // mostra o quarto por cima, como uma maquete.
  const walls = {
    back: new THREE.Group(),
    front: new THREE.Group(),
    left: new THREE.Group(),
    right: new THREE.Group(),
    ceiling: new THREE.Group(),
  };
  Object.values(walls).forEach((g) => root.add(g));

  const plane = (w: number, h: number, mat: THREE.Material) => {
    const m = new THREE.Mesh(new THREE.PlaneGeometry(w, h), mat);
    m.receiveShadow = true;
    return m;
  };

  // Piso
  const floor = plane(W, D, woodFloor);
  floor.rotation.x = -Math.PI / 2;
  root.add(floor);

  // Paredes (viradas para dentro)
  const back = plane(W, H, wallMat);
  back.position.set(0, H / 2, -D / 2);
  walls.back.add(back);
  const front = plane(W, H, wallWarm);
  front.position.set(0, H / 2, D / 2);
  front.rotation.y = Math.PI;
  walls.front.add(front);
  const left = plane(D, H, wallWarm);
  left.position.set(-W / 2, H / 2, 0);
  left.rotation.y = Math.PI / 2;
  walls.left.add(left);
  const right = plane(D, H, wallMat);
  right.position.set(W / 2, H / 2, 0);
  right.rotation.y = -Math.PI / 2;
  walls.right.add(right);
  const ceiling = plane(W, D, ceilingMat);
  ceiling.position.set(0, H, 0);
  ceiling.rotation.x = Math.PI / 2;
  walls.ceiling.add(ceiling);

  // Rodapes
  walls.back.add(box(W, 0.08, 0.02, darkWood, [0, 0.04, -D / 2 + 0.01]));
  walls.front.add(box(W, 0.08, 0.02, darkWood, [0, 0.04, D / 2 - 0.01]));
  walls.left.add(box(0.02, 0.08, D, darkWood, [-W / 2 + 0.01, 0.04, 0]));
  walls.right.add(box(0.02, 0.08, D, darkWood, [W / 2 - 0.01, 0.04, 0]));

  // Sanca de LED no teto (iluminacao indireta em todo o perimetro)
  const cove = 0.18;
  walls.ceiling.add(box(W - 0.4, 0.03, 0.03, ledMat, [0, H - 0.06, -D / 2 + cove]));
  walls.ceiling.add(box(W - 0.4, 0.03, 0.03, ledMat, [0, H - 0.06, D / 2 - cove]));
  walls.ceiling.add(box(0.03, 0.03, D - 0.4, ledMat, [-W / 2 + cove, H - 0.06, 0]));
  walls.ceiling.add(box(0.03, 0.03, D - 0.4, ledMat, [W / 2 - cove, H - 0.06, 0]));
  // forro rebaixado central
  walls.ceiling.add(box(W - 0.9, 0.12, D - 0.9, ceilingMat, [0, H - 0.06, 0]));

  // ---------- CAMA (parede do fundo) ----------
  const bedX = -1;
  // painel de madeira atras da cabeceira
  walls.back.add(box(3.8, H, 0.06, darkWood, [bedX, H / 2, -D / 2 + 0.03]));
  // cabeceira estofada (4 gomos)
  for (let i = 0; i < 4; i++) {
    walls.back.add(box(0.74, 1.25, 0.12, velvet, [bedX - 1.14 + i * 0.76, 1.12, -D / 2 + 0.13], 0.05));
  }
  // fita de LED atras/acima da cabeceira
  walls.back.add(box(3.2, 0.025, 0.025, ledMat, [bedX, 1.8, -D / 2 + 0.08]));

  const bed = new THREE.Group();
  const bedZ = -D / 2 + 0.2 + 1.15;
  bed.add(box(2.1, 0.32, 2.3, walnut, [bedX, 0.2, bedZ], 0.04)); // base
  bed.add(box(2.0, 0.26, 2.15, linen, [bedX, 0.49, bedZ], 0.08)); // colchao
  bed.add(box(2.06, 0.07, 1.55, linen, [bedX, 0.63, bedZ + 0.33], 0.035)); // edredom
  bed.add(box(2.1, 0.075, 0.45, runnerMat, [bedX, 0.64, bedZ + 0.78], 0.03)); // peseira
  for (let i = 0; i < 2; i++) {
    bed.add(box(0.8, 0.2, 0.42, linen, [bedX - 0.45 + i * 0.9, 0.72, bedZ - 0.82], 0.09));
    bed.add(box(0.7, 0.16, 0.3, velvet, [bedX - 0.45 + i * 0.9, 0.74, bedZ - 0.55], 0.07));
  }
  // LED sob a cama ("cama flutuante")
  bed.add(box(2.0, 0.02, 0.02, ledMat, [bedX, 0.05, bedZ + 1.13]));
  root.add(bed);

  // criados-mudos + luminarias
  const lampLights: THREE.PointLight[] = [];
  for (const side of [-1, 1]) {
    const x = bedX + side * 1.45;
    root.add(box(0.5, 0.42, 0.42, walnut, [x, 0.45, -D / 2 + 0.35], 0.02));
    root.add(cyl(0.05, 0.08, 0.3, gold, [x, 0.81, -D / 2 + 0.35]));
    const shadeMat = new THREE.MeshStandardMaterial({ color: "#f3e4cc", emissive: "#ffcf9e", emissiveIntensity: 0.6, roughness: 0.9, side: THREE.DoubleSide });
    root.add(cyl(0.13, 0.17, 0.22, shadeMat, [x, 1.05, -D / 2 + 0.35]));
    const l = new THREE.PointLight("#ffcf9e", 3, 3.2, 2);
    l.position.set(x, 1.05, -D / 2 + 0.38);
    lampLights.push(l);
    root.add(l);
  }

  // tapete
  const rug = plane(3.4, 2.4, std("#ffffff", 0.98, 0, {
    map: canvasTexture(512, (ctx, s) => {
      ctx.fillStyle = "#3b1520";
      ctx.fillRect(0, 0, s, s);
      ctx.strokeStyle = "#c9a25a";
      ctx.lineWidth = 6;
      ctx.strokeRect(28, 28, s - 56, s - 56);
      ctx.lineWidth = 2;
      ctx.strokeRect(46, 46, s - 92, s - 92);
    }),
  }));
  rug.rotation.x = -Math.PI / 2;
  rug.position.set(bedX, 0.006, bedZ + 0.9);
  root.add(rug);

  // ---------- TV + painel ripado (parede da frente) ----------
  for (let i = 0; i < 26; i++) {
    walls.front.add(box(0.07, H, 0.05, walnut, [bedX - 1.3 + i * 0.104, H / 2, D / 2 - 0.04]));
  }
  walls.front.add(box(1.5, 0.86, 0.04, blackGloss, [bedX, 1.45, D / 2 - 0.1]));
  const screenTex = canvasTexture(1024, (ctx, s) => {
    const g = ctx.createLinearGradient(0, 0, s, s);
    g.addColorStop(0, "#1a0f2e");
    g.addColorStop(0.55, "#4a1030");
    g.addColorStop(1, "#0d0a14");
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, s, s);
    ctx.fillStyle = "#d6aa5c";
    ctx.textAlign = "center";
    ctx.font = "600 64px sans-serif";
    ctx.fillText("SUÍTE IMPERIAL", s / 2, s / 2 - 10);
    ctx.fillStyle = "rgba(255,255,255,0.75)";
    ctx.font = "36px sans-serif";
    ctx.fillText("Seja bem-vindo", s / 2, s / 2 + 60);
  });
  const screen = plane(1.42, 0.79, new THREE.MeshStandardMaterial({ color: "#000", emissive: "#ffffff", emissiveMap: screenTex, emissiveIntensity: 0.9, roughness: 0.2 }));
  screen.position.set(bedX, 1.45, D / 2 - 0.125);
  screen.rotation.y = Math.PI;
  walls.front.add(screen);
  // rack suspenso com LED embaixo
  walls.front.add(box(2.4, 0.32, 0.42, darkWood, [bedX, 0.5, D / 2 - 0.3], 0.02));
  walls.front.add(box(2.3, 0.02, 0.02, ledMat, [bedX, 0.33, D / 2 - 0.12]));

  // ---------- PORTA DE ENTRADA (parede da frente, direita) ----------
  const doorX = 2.9;
  walls.front.add(box(1.2, 2.35, 0.1, gold, [doorX, 1.175, D / 2 - 0.02]));
  walls.front.add(box(1.04, 2.24, 0.06, darkWood, [doorX, 1.12, D / 2 - 0.06]));
  for (let i = 0; i < 4; i++) {
    walls.front.add(box(0.015, 2.0, 0.01, gold, [doorX - 0.36 + i * 0.24, 1.12, D / 2 - 0.095]));
  }
  walls.front.add(box(0.04, 0.35, 0.05, gold, [doorX - 0.4, 1.05, D / 2 - 0.12], 0.015));

  // ---------- HIDROMASSAGEM (fundo, direita) ----------
  const tubX = 2.65;
  const tubZ = -1.85;
  // revestimento de marmore nas paredes da area molhada
  const bathWall = plane(2.9, H, marble);
  bathWall.position.set(W / 2 - 1.45, H / 2, -D / 2 + 0.012);
  walls.back.add(bathWall);
  const bathSide = plane(2.6, H, marble);
  bathSide.position.set(W / 2 - 0.012, H / 2, -D / 2 + 1.3);
  bathSide.rotation.y = -Math.PI / 2;
  walls.right.add(bathSide);
  // deque elevado
  root.add(box(2.7, 0.28, 2.55, marbleDark, [W / 2 - 1.35, 0.14, -D / 2 + 1.275]));
  root.add(box(2.6, 0.02, 0.02, ledMat, [W / 2 - 1.35, 0.03, -D / 2 + 2.56])); // LED no degrau

  // banheira (casco com 4 paredes + fundo, para ter "buraco" de verdade)
  const tw = 1.9;
  const td = 1.45;
  const th = 0.5;
  const t = 0.13;
  const tubY = 0.28 + th / 2;
  const tub = new THREE.Group();
  tub.add(box(tw, th, t, porcelain, [tubX, tubY, tubZ - td / 2 + t / 2], 0.05));
  tub.add(box(tw, th, t, porcelain, [tubX, tubY, tubZ + td / 2 - t / 2], 0.05));
  tub.add(box(t, th, td, porcelain, [tubX - tw / 2 + t / 2, tubY, tubZ], 0.05));
  tub.add(box(t, th, td, porcelain, [tubX + tw / 2 - t / 2, tubY, tubZ], 0.05));
  tub.add(box(tw - 0.1, 0.06, td - 0.1, porcelain, [tubX, 0.31, tubZ], 0.02));
  // agua
  const waterMat = new THREE.MeshStandardMaterial({
    color: "#3aa6c4",
    emissive: "#1f8fb0",
    emissiveIntensity: 0.35,
    roughness: 0.04,
    metalness: 0.1,
    transparent: true,
    opacity: 0.72,
  });
  const water = plane(tw - 2 * t, td - 2 * t, waterMat);
  water.rotation.x = -Math.PI / 2;
  water.position.set(tubX, tubY + th / 2 - 0.09, tubZ);
  tub.add(water);
  // jatos (pontinhos dourados) e torneira
  for (let i = 0; i < 3; i++) tub.add(cyl(0.025, 0.025, 0.02, gold, [tubX - 0.45 + i * 0.45, tubY - 0.05, tubZ - td / 2 + t + 0.005]));
  tub.add(cyl(0.03, 0.03, 0.35, gold, [tubX + 0.6, tubY + 0.42, tubZ - td / 2 + 0.06]));
  const spout = box(0.04, 0.04, 0.22, gold, [tubX + 0.6, tubY + 0.58, tubZ - td / 2 + 0.16], 0.015);
  tub.add(spout);
  // toalhas enroladas e velas
  for (let i = 0; i < 2; i++) {
    const towel = cyl(0.07, 0.07, 0.3, linen, [tubX - 0.7 + i * 0.16, 0.35, tubZ + td / 2 + 0.25]);
    towel.rotation.x = Math.PI / 2;
    tub.add(towel);
  }
  const candleMat = new THREE.MeshStandardMaterial({ color: "#fff6e8", emissive: "#ffb35c", emissiveIntensity: 0.35 });
  for (let i = 0; i < 3; i++) tub.add(cyl(0.035, 0.035, 0.08 + i * 0.04, candleMat, [tubX + 0.55 + i * 0.12, 0.33 + i * 0.02, tubZ + td / 2 + 0.25]));
  root.add(tub);
  // luz da cromoterapia (embaixo d'agua)
  const cromoLight = new THREE.PointLight("#3aa6c4", 4, 2.6, 2);
  cromoLight.position.set(tubX, tubY + 0.05, tubZ);
  root.add(cromoLight);

  // espelho com moldura dourada (parede direita)
  walls.right.add(box(0.04, 1.9, 1.15, gold, [W / 2 - 0.03, 1.5, 1.2]));
  const mirror = plane(1.05, 1.8, mirrorMat);
  mirror.position.set(W / 2 - 0.055, 1.5, 1.2);
  mirror.rotation.y = -Math.PI / 2;
  walls.right.add(mirror);

  // ---------- ESTAR (parede esquerda) ----------
  const chair = (x: number, z: number, rotY: number) => {
    const g = new THREE.Group();
    g.add(box(0.78, 0.18, 0.74, leather, [0, 0.36, 0], 0.06)); // assento
    g.add(box(0.78, 0.55, 0.16, leather, [0, 0.66, -0.31], 0.06)); // encosto
    g.add(box(0.14, 0.42, 0.74, leather, [-0.36, 0.5, 0], 0.05)); // bracos
    g.add(box(0.14, 0.42, 0.74, leather, [0.36, 0.5, 0], 0.05));
    for (const [lx, lz] of [[-0.3, -0.28], [0.3, -0.28], [-0.3, 0.28], [0.3, 0.28]]) {
      g.add(cyl(0.02, 0.015, 0.27, gold, [lx, 0.135, lz], 12));
    }
    g.position.set(x, 0, z);
    g.rotation.y = rotY;
    return g;
  };
  root.add(chair(-3.25, 0.55, Math.PI / 2 + 0.35));
  root.add(chair(-3.25, 1.95, Math.PI / 2 - 0.35));
  // mesa de centro redonda
  root.add(cyl(0.34, 0.34, 0.035, marbleDark, [-2.45, 0.46, 1.25], 48));
  root.add(cyl(0.04, 0.12, 0.44, gold, [-2.45, 0.22, 1.25], 24));
  // champanhe e tacas
  root.add(cyl(0.035, 0.04, 0.28, std("#0f3d22", 0.1, 0.3), [-2.5, 0.62, 1.2], 20));
  for (const dx of [0.12, 0.2]) {
    root.add(cyl(0.03, 0.008, 0.1, std("#ffffff", 0.05, 0, { transparent: true, opacity: 0.35 }), [-2.45 + dx, 0.6, 1.33], 16));
  }
  // quadro abstrato
  const art = plane(1.3, 0.85, std("#ffffff", 0.7, 0, {
    map: canvasTexture(512, (ctx, s) => {
      ctx.fillStyle = "#2a0d16";
      ctx.fillRect(0, 0, s, s);
      ctx.lineWidth = 10;
      ["#c9a25a", "#8c1d43", "#e8d2b0"].forEach((c, i) => {
        ctx.strokeStyle = c;
        ctx.beginPath();
        ctx.arc(s * (0.35 + i * 0.15), s * 0.62, s * (0.32 - i * 0.07), Math.PI, 0);
        ctx.stroke();
      });
    }),
  }));
  art.position.set(-W / 2 + 0.03, 1.65, 1.25);
  art.rotation.y = Math.PI / 2;
  walls.left.add(art);
  walls.left.add(box(0.03, 0.9, 1.36, gold, [-W / 2 + 0.015, 1.65, 1.25]));

  // plantas
  const plant = (x: number, z: number, scale: number) => {
    const g = new THREE.Group();
    g.add(cyl(0.18, 0.13, 0.4, std("#1c1a1a", 0.35), [0, 0.2, 0]));
    const leaf = std("#2f5a35", 0.65);
    const r = rng(Math.round(x * 100 + z));
    for (let i = 0; i < 9; i++) {
      const m = new THREE.Mesh(new THREE.SphereGeometry(0.16, 12, 10), leaf);
      m.scale.set(0.45, 1.6, 0.2);
      const a = (i / 9) * Math.PI * 2;
      m.position.set(Math.cos(a) * 0.12, 0.7 + r() * 0.35, Math.sin(a) * 0.12);
      m.rotation.set(Math.sin(a) * 0.5, a, Math.cos(a) * 0.5);
      m.castShadow = true;
      g.add(m);
    }
    g.position.set(x, 0, z);
    g.scale.setScalar(scale);
    return g;
  };
  root.add(plant(-3.55, 2.6, 1.25));
  root.add(plant(1.0, -2.62, 1.0));

  // ---------- LUZES ----------
  const hemi = new THREE.HemisphereLight("#ffe8d6", "#1a1012", 0.6);
  root.add(hemi);

  const spot = (x: number, z: number, target: [number, number, number], shadow: boolean) => {
    const s = new THREE.SpotLight("#ffcf9e", 30, 7, 0.65, 0.85, 2);
    s.position.set(x, H - 0.05, z);
    s.target.position.set(...target);
    s.castShadow = shadow && high;
    if (s.castShadow) {
      s.shadow.mapSize.set(1024, 1024);
      s.shadow.bias = -0.0004;
      s.shadow.radius = 4;
    }
    root.add(s, s.target);
    // "spot" embutido no forro
    walls.ceiling.add(cyl(0.06, 0.06, 0.02, std("#000", 1, 0, { emissive: "#fff0dc", emissiveIntensity: 2 }), [x, H - 0.125, z], 20));
    return s;
  };
  const spots = [
    spot(bedX, -1.5, [bedX, 0.6, -1.6], true),
    spot(tubX, tubZ, [tubX, 0.4, tubZ], true),
    spot(-2.5, 1.25, [-2.5, 0.4, 1.25], false),
    spot(bedX, 2.2, [bedX, 1.2, 2.9], false),
  ];

  // Luzes de area (iluminacao indireta realista das fitas de LED)
  const ledLights: THREE.RectAreaLight[] = [];
  const rect = (w: number, h: number, pos: [number, number, number], look: [number, number, number]) => {
    const l = new THREE.RectAreaLight("#ffa45c", 8, w, h);
    l.position.set(...pos);
    l.lookAt(...look);
    ledLights.push(l);
    root.add(l);
  };
  rect(3.2, 0.12, [bedX, 1.82, -D / 2 + 0.12], [bedX, 3.5, -D / 2 - 0.6]); // cabeceira
  rect(2.3, 0.12, [bedX, 0.3, D / 2 - 0.2], [bedX, -1, D / 2 + 0.2]); // rack da TV
  if (high) {
    rect(W - 0.6, 0.15, [0, H - 0.1, -D / 2 + 0.25], [0, H - 1.2, -D / 2 - 0.5]);
    rect(W - 0.6, 0.15, [0, H - 0.1, D / 2 - 0.25], [0, H - 1.2, D / 2 + 0.5]);
    rect(D - 0.6, 0.15, [-W / 2 + 0.25, H - 0.1, 0], [-W / 2 - 0.5, H - 1.2, 0]);
    rect(D - 0.6, 0.15, [W / 2 - 0.25, H - 0.1, 0], [W / 2 + 0.5, H - 1.2, 0]);
  }
  rect(2.5, 0.1, [W / 2 - 1.35, 0.1, -D / 2 + 2.62], [W / 2 - 1.35, -1, -D / 2 + 3.2]); // degrau

  // ---------- cenas de luz ----------
  let cromo = false;
  let exposure = 1.05;
  const setLightScene = (id: LightSceneId) => {
    const c = SCENES[id];
    ledMat.emissive.set(c.led);
    ledMat.emissiveIntensity = 3 * c.ledI;
    ledLights.forEach((l) => {
      l.color.set(c.led);
      l.intensity = 8 * c.ledI;
    });
    spots.forEach((s) => {
      s.color.set(c.warm);
      s.intensity = 30 * c.spot;
    });
    lampLights.forEach((l) => {
      l.color.set(c.warm);
      l.intensity = 3 * c.lamp;
    });
    hemi.intensity = 0.6 * c.hemi;
    cromo = c.cromo;
    exposure = c.exposure;
  };
  setLightScene("aconchegante");

  // ---------- pontos de interesse ----------
  const hotspots: HotspotDef[] = [
    { id: "cama", title: "Cama king size", text: "Cabeceira estofada em veludo, enxoval de algodão egípcio e iluminação indireta.", position: [bedX, 0.95, -1.4] },
    { id: "hidro", title: "Hidromassagem para 2", text: "Banheira com jatos e cromoterapia, em deque de mármore com degrau iluminado.", position: [tubX, 1.0, tubZ] },
    { id: "tv", title: 'Smart TV 65"', text: "Painel ripado em madeira, streaming e som ambiente integrado.", position: [bedX, 2.05, D / 2 - 0.2] },
    { id: "estar", title: "Espaço de estar", text: "Poltronas em couro com mesa de mármore. Champanhe de boas-vindas.", position: [-2.6, 1.0, 1.25] },
    { id: "luz", title: "Iluminação cênica", text: "Sanca e fitas de LED com cenas de luz. Experimente os botões de clima.", position: [0.9, 2.65, -2.6] },
    { id: "entrada", title: "Entrada privativa", text: "Acesso direto e discreto à suíte.", position: [doorX, 1.4, D / 2 - 0.25] },
  ];

  const presets: CameraPreset[] = [
    { id: "geral", label: "Visão geral", position: [5.2, 7.4, 8.4], target: [0, 0.4, 0] },
    { id: "entrada", label: "Entrada", position: [2.7, 1.65, 2.3], target: [-1.2, 1.0, -1.6] },
    { id: "cama", label: "Cama", position: [0.6, 1.55, 1.4], target: [bedX, 0.7, -2.0] },
    { id: "hidro", label: "Hidromassagem", position: [0.6, 1.75, 0.5], target: [tubX, 0.45, tubZ] },
    { id: "tv", label: "TV e estar", position: [-0.4, 1.35, -1.2], target: [-1.8, 1.1, 2.4] },
  ];

  // ---------- atualizacao a cada quadro ----------
  const hueColor = new THREE.Color();
  const update = (time: number, camera: THREE.Camera) => {
    // esconde paredes que estao entre a camera e o quarto (efeito maquete)
    const p = camera.position;
    walls.back.visible = p.z > -D / 2;
    walls.front.visible = p.z < D / 2;
    walls.left.visible = p.x > -W / 2;
    walls.right.visible = p.x < W / 2;
    walls.ceiling.visible = p.y < H;

    // agua "respirando" + cromoterapia
    water.position.y = tubY + th / 2 - 0.09 + Math.sin(time * 1.3) * 0.004;
    if (cromo) {
      // cromoterapia so em tons de azul, roxo e rosa (0.55..0.95 no circulo de cores)
      hueColor.setHSL(0.55 + ((Math.sin(time * 0.25) + 1) / 2) * 0.4, 0.85, 0.55);
      waterMat.emissive.copy(hueColor);
      waterMat.emissiveIntensity = 0.55;
      cromoLight.color.copy(hueColor);
      cromoLight.intensity = 6;
    } else {
      waterMat.emissive.set("#1f8fb0");
      waterMat.emissiveIntensity = 0.3;
      cromoLight.color.set("#3aa6c4");
      cromoLight.intensity = 3;
    }
  };

  // pontos presos a uma parede somem quando a parede some (visao geral)
  const hotspotWall: Record<string, THREE.Group> = { tv: walls.front, entrada: walls.front };
  const isHotspotVisible = (id: string) => hotspotWall[id]?.visible ?? true;

  return {
    root,
    isHotspotVisible,
    hotspots,
    presets,
    setLightScene,
    getExposure: () => exposure,
    update,
    bounds: new THREE.Box3(new THREE.Vector3(-W / 2 + 0.3, 0.2, -D / 2 + 0.3), new THREE.Vector3(W / 2 - 0.3, H - 0.3, D / 2 - 0.3)),
  };
}
