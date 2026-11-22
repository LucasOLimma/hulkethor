import * as THREE from "three";

// =====================================================================
// GEOMETRIAS ORGANICAS (medidas em metros)
// Formas que nao existem em bibliotecas prontas: travesseiros, edredom
// com dobras, cabeceira capitone, cortinas pregueadas e a banheira.
// Tudo com subdivisao alta e ruido suave para nao parecer "caixa".
// =====================================================================

// ---------- ruido (valor) deterministico ----------
function hash(x: number, y: number, seed: number) {
  const s = Math.sin(x * 127.1 + y * 311.7 + seed * 74.7) * 43758.5453;
  return s - Math.floor(s);
}
function smooth(t: number) {
  return t * t * (3 - 2 * t);
}
export function noise2(x: number, y: number, seed = 0) {
  const xi = Math.floor(x);
  const yi = Math.floor(y);
  const xf = smooth(x - xi);
  const yf = smooth(y - yi);
  const a = hash(xi, yi, seed);
  const b = hash(xi + 1, yi, seed);
  const c = hash(xi, yi + 1, seed);
  const d = hash(xi + 1, yi + 1, seed);
  return (a + (b - a) * xf + (c - a) * yf + (a - b - c + d) * xf * yf) * 2 - 1;
}
export function fbm(x: number, y: number, seed = 0, octaves = 4) {
  let v = 0;
  let amp = 0.5;
  let f = 1;
  for (let i = 0; i < octaves; i++) {
    v += amp * noise2(x * f, y * f, seed + i * 13);
    f *= 2.03;
    amp *= 0.5;
  }
  return v;
}

/**
 * Coordenadas de textura "de caixa" em metros: cada face recebe a projecao
 * do eixo dominante da normal. Mantem a escala real das texturas (veios
 * de marmore e tabuas com o tamanho certo em qualquer objeto).
 */
export function applyBoxUV(geo: THREE.BufferGeometry, metersPerRepeat: number) {
  const pos = geo.getAttribute("position");
  if (!geo.getAttribute("normal")) geo.computeVertexNormals();
  const nor = geo.getAttribute("normal");
  const uv = new Float32Array(pos.count * 2);
  for (let i = 0; i < pos.count; i++) {
    const x = pos.getX(i);
    const y = pos.getY(i);
    const z = pos.getZ(i);
    const ax = Math.abs(nor.getX(i));
    const ay = Math.abs(nor.getY(i));
    const az = Math.abs(nor.getZ(i));
    let u: number;
    let v: number;
    if (ay >= ax && ay >= az) {
      u = x;
      v = z;
    } else if (ax >= az) {
      u = z;
      v = y;
    } else {
      u = x;
      v = y;
    }
    uv[i * 2] = u / metersPerRepeat;
    uv[i * 2 + 1] = v / metersPerRepeat;
  }
  geo.setAttribute("uv", new THREE.BufferAttribute(uv, 2));
  return geo;
}

/** Superelipsoide: base de travesseiros, almofadas e assentos estofados. */
export function cushion(
  rx: number,
  ry: number,
  rz: number,
  opts: { e1?: number; e2?: number; wrinkle?: number; seed?: number; segments?: number } = {},
) {
  const { e1 = 0.45, e2 = 0.18, wrinkle = 0.006, seed = 1, segments = 64 } = opts;
  const geo = new THREE.SphereGeometry(1, segments, Math.round(segments * 0.6));
  const pos = geo.getAttribute("position");
  const sp = (v: number, e: number) => Math.sign(v) * Math.pow(Math.abs(v), e);
  for (let i = 0; i < pos.count; i++) {
    const x = pos.getX(i);
    const y = pos.getY(i);
    const z = pos.getZ(i);
    const phi = Math.asin(THREE.MathUtils.clamp(y, -1, 1));
    const theta = Math.atan2(z, x);
    const cp = Math.cos(phi);
    let nx = sp(cp, e1) * sp(Math.cos(theta), e2);
    let ny = sp(Math.sin(phi), e1);
    let nz = sp(cp, e1) * sp(Math.sin(theta), e2);
    // pequenas rugas de tecido
    const w = fbm(nx * 6 + 3, nz * 6 + ny * 3, seed) * wrinkle;
    nx *= rx;
    ny = ny * ry + w;
    nz *= rz;
    pos.setXYZ(i, nx, ny, nz);
  }
  geo.computeVertexNormals();
  return geo;
}

/**
 * Lencol/edredom caindo sobre o colchao: plano que cobre o topo e
 * desce pelas laterais (com dobras suaves e caimento nas quinas).
 */
export function drapedSheet(opts: {
  width: number; // largura do colchao
  depth: number; // comprimento coberto (a partir da cabeceira)
  drop: number; // quanto cai pelas laterais
  frontDrop?: number; // quanto cai no pe da cama
  seed?: number;
  wrinkle?: number;
  /** afastamento extra da borda (para um tecido ficar POR FORA de outro) */
  outset?: number;
}) {
  const { width, depth, drop, frontDrop = drop, seed = 3, wrinkle = 0.012, outset = 0 } = opts;
  const hx = width / 2;
  const zBack = -depth / 2;
  const zFront = depth / 2;
  const geo = new THREE.PlaneGeometry(width + drop * 2, depth + frontDrop, 200, 170);
  geo.rotateX(-Math.PI / 2);
  geo.translate(0, 0, frontDrop / 2); // z vai de zBack ate zFront + frontDrop
  const pos = geo.getAttribute("position");
  const r = 0.035; // raio da dobra na quina do colchao
  for (let i = 0; i < pos.count; i++) {
    const x0 = pos.getX(i);
    const z0 = pos.getZ(i);
    const ox = Math.max(Math.abs(x0) - hx, 0);
    const oz = Math.max(z0 - zFront, 0);
    const out = Math.hypot(ox, oz);
    let x = x0;
    let z = z0;
    let y: number;
    if (out > 0) {
      // parte que passa da borda: dobra (arco) e depois cai na vertical
      let horiz: number;
      if (out < (r * Math.PI) / 2) {
        const a = out / r;
        horiz = r * Math.sin(a) + outset * Math.sin(a);
        y = -r * (1 - Math.cos(a));
      } else {
        horiz = r + outset;
        y = -r - (out - (r * Math.PI) / 2);
      }
      const ex = THREE.MathUtils.clamp(x0, -hx, hx);
      const ez = Math.min(z0, zFront);
      x = ex + (ox / out) * Math.sign(x0) * horiz;
      z = ez + (oz / out) * horiz;
      // pregas verticais no caimento, crescendo para baixo
      const along = ox >= oz ? z0 : x0;
      const grow = Math.min(-y / 0.2, 1);
      const fold = (Math.sin(along * 22 + fbm(along * 2, y * 3, seed) * 3) * 0.5 + fbm(along * 5, y * 4, seed + 1) * 0.5) * 0.02 * grow;
      if (ox >= oz) x += Math.sign(x0) * fold;
      else z += fold;
    } else {
      // rugas suaves no topo, mais marcadas perto dos travesseiros
      const near = 1 - THREE.MathUtils.smoothstep(z0, zBack, zBack + 0.7);
      y = fbm(x0 * 2.5, z0 * 2.5, seed) * wrinkle * (1 + near * 1.5) + Math.abs(fbm(x0 * 7, z0 * 3, seed + 5)) * wrinkle * 0.6;
    }
    pos.setXYZ(i, x, y, z);
  }
  geo.computeVertexNormals();
  return geo;
}

/** Cabeceira capitone (botoes em losango), com bordas arredondadas. */
export function tuftedPanel(width: number, height: number, depth: number, spacing = 0.22) {
  const geo = new THREE.PlaneGeometry(width, height, 220, 130);
  const pos = geo.getAttribute("position");
  const buttons: THREE.Vector3[] = [];
  const rows = Math.floor(height / spacing);
  const cols = Math.floor(width / spacing);
  for (let r = 1; r < rows; r++) {
    for (let c = 1; c < cols + (r % 2 ? 0 : 1); c++) {
      const bx = -width / 2 + (c - (r % 2 ? 0 : 0.5)) * (width / cols);
      const by = -height / 2 + r * (height / rows);
      if (Math.abs(bx) < width / 2 - 0.08) buttons.push(new THREE.Vector3(bx, by, 0));
    }
  }
  const sigma2 = (spacing * 0.32) ** 2;
  for (let i = 0; i < pos.count; i++) {
    const x = pos.getX(i);
    const y = pos.getY(i);
    // borda arredondada
    const ex = width / 2 - Math.abs(x);
    const ey = height / 2 - Math.abs(y);
    const edge = Math.min(ex, ey);
    const edgeFall = edge < 0.06 ? Math.sqrt(Math.max(0, 1 - ((0.06 - edge) / 0.06) ** 2)) : 1;
    // afundamento nos botoes
    let dimple = 0;
    for (const b of buttons) {
      const d2 = (x - b.x) ** 2 + (y - b.y) ** 2;
      if (d2 < sigma2 * 9) dimple = Math.max(dimple, Math.exp(-d2 / sigma2));
    }
    const z = depth * edgeFall * (1 - dimple * 0.55) + fbm(x * 9, y * 9, 7) * 0.002;
    pos.setZ(i, z);
  }
  geo.computeVertexNormals();
  return { geometry: geo, buttons };
}

/** Cortina pregueada, com leve variacao e barra tocando o chao. */
export function curtain(width: number, height: number, folds: number, depth = 0.06, seed = 11) {
  const geo = new THREE.PlaneGeometry(width, height, Math.max(120, folds * 16), 60);
  const pos = geo.getAttribute("position");
  for (let i = 0; i < pos.count; i++) {
    const x = pos.getX(i);
    const y = pos.getY(i);
    const t = (x / width + 0.5) * folds * Math.PI * 2;
    const vary = 1 + fbm(x * 3, y * 0.6, seed) * 0.35;
    // pregas mais fundas em cima (presas no trilho) e soltas embaixo
    const top = THREE.MathUtils.smoothstep(y, -height / 2, height / 2);
    const z = Math.sin(t + fbm(x * 2, y * 0.5, seed + 2) * 0.8) * depth * vary * (0.75 + top * 0.25);
    pos.setZ(i, z);
  }
  geo.computeVertexNormals();
  return geo;
}

/** Retangulo de cantos arredondados (contorno 2D). */
// (Shape tambem serve como "furo" de outra forma)
export function roundedRect(w: number, h: number, r: number, hole = false) {
  void hole;
  const s = new THREE.Shape();
  const x = -w / 2;
  const y = -h / 2;
  s.moveTo(x + r, y);
  s.lineTo(x + w - r, y);
  s.quadraticCurveTo(x + w, y, x + w, y + r);
  s.lineTo(x + w, y + h - r);
  s.quadraticCurveTo(x + w, y + h, x + w - r, y + h);
  s.lineTo(x + r, y + h);
  s.quadraticCurveTo(x, y + h, x, y + h - r);
  s.lineTo(x, y + r);
  s.quadraticCurveTo(x, y, x + r, y);
  return s;
}

/**
 * Banheira de hidromassagem embutida: borda com espessura real, paredes
 * internas inclinadas e fundo. Origem no centro, no nivel da borda.
 */
export function bathtub(opts: { width: number; depth: number; height: number; wall: number; radius: number }) {
  const { width, depth, height, wall, radius } = opts;
  // borda (anel) com bisel arredondado
  const rim = roundedRect(width, depth, radius);
  rim.holes.push(roundedRect(width - wall * 2, depth - wall * 2, radius * 0.8, true) as THREE.Path);
  const rimGeo = new THREE.ExtrudeGeometry(rim, {
    depth: 0.03,
    bevelEnabled: true,
    bevelThickness: 0.012,
    bevelSize: 0.012,
    bevelSegments: 4,
    curveSegments: 24,
  });
  rimGeo.rotateX(-Math.PI / 2);
  rimGeo.translate(0, -0.03, 0);

  // bacia: paredes internas que estreitam ate o fundo
  const innerW = width - wall * 2;
  const innerD = depth - wall * 2;
  const rings = 24;
  const shapePts = roundedRect(innerW, innerD, radius * 0.8).getSpacedPoints(160);
  const verts: number[] = [];
  const idx: number[] = [];
  const cols = shapePts.length;
  for (let r = 0; r <= rings; r++) {
    const t = r / rings;
    const yy = -t * height;
    // fundo mais estreito e cantos que viram curva (como banheira real)
    const shrink = 1 - Math.pow(t, 2.2) * 0.14;
    for (const p of shapePts) {
      verts.push(p.x * shrink, yy, -p.y * shrink);
    }
  }
  for (let r = 0; r < rings; r++) {
    for (let c = 0; c < cols - 1; c++) {
      const a = r * cols + c;
      const b = a + cols;
      idx.push(a, b, a + 1, b, b + 1, a + 1);
    }
  }
  const basin = new THREE.BufferGeometry();
  basin.setAttribute("position", new THREE.Float32BufferAttribute(verts, 3));
  basin.setIndex(idx);
  basin.computeVertexNormals();

  const floorShape = roundedRect(innerW * 0.86, innerD * 0.86, radius * 0.7);
  const floor = new THREE.ShapeGeometry(floorShape, 24);
  floor.rotateX(-Math.PI / 2);
  floor.translate(0, -height, 0);

  return { rim: rimGeo, basin, floor, innerW, innerD };
}

/** Mapa de normal de ondulacao suave (agua). */
export function rippleNormalTexture(size = 256, seed = 4) {
  const canvas = document.createElement("canvas");
  canvas.width = canvas.height = size;
  const ctx = canvas.getContext("2d")!;
  const img = ctx.createImageData(size, size);
  const h = (x: number, y: number) => fbm(x / 28, y / 28, seed, 3) + Math.sin((x + y) / 9) * 0.08;
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const dx = h(x + 1, y) - h(x - 1, y);
      const dy = h(x, y + 1) - h(x, y - 1);
      const n = new THREE.Vector3(-dx * 3, -dy * 3, 1).normalize();
      const i = (y * size + x) * 4;
      img.data[i] = (n.x * 0.5 + 0.5) * 255;
      img.data[i + 1] = (n.y * 0.5 + 0.5) * 255;
      img.data[i + 2] = (n.z * 0.5 + 0.5) * 255;
      img.data[i + 3] = 255;
    }
  }
  ctx.putImageData(img, 0, 0);
  const tex = new THREE.CanvasTexture(canvas);
  tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
  return tex;
}
