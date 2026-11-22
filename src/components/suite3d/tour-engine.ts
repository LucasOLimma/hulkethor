import * as THREE from "three";
import type { Tour, TourScene } from "./types";

// =====================================================================
// MOTOR DO TOUR 360 (fotos panoramicas reais, Three.js / WebGL)
// A camera fica no centro de uma esfera forrada com a foto 360.
// - Arrastar (mouse/dedo) olha para os lados; roda/pinca = zoom.
// - Setas do teclado tambem giram a visao.
// - Troca de ambiente com transicao suave (fade + leve aproximacao).
// =====================================================================

export type TourEngineOptions = {
  onUserInteract?: () => void;
  onSceneChange?: (id: string) => void;
  onLoadingChange?: (loading: boolean) => void;
  onError?: (sceneId: string) => void;
};

const DEG = Math.PI / 180;
const FOV_MIN = 35;
const FOV_MAX = 90;

/** Direcao 3D de um ponto da foto (yaw/pitch em graus). */
export function directionOf(yaw: number, pitch: number, out = new THREE.Vector3()) {
  const y = yaw * DEG;
  const p = pitch * DEG;
  return out.set(-Math.cos(y) * Math.cos(p), Math.sin(p), -Math.sin(y) * Math.cos(p));
}

export class TourEngine {
  private renderer: THREE.WebGLRenderer;
  private scene = new THREE.Scene();
  private camera: THREE.PerspectiveCamera;
  private loader = new THREE.TextureLoader();
  private textures = new Map<string, Promise<THREE.Texture>>();
  private front: THREE.Mesh<THREE.SphereGeometry, THREE.MeshBasicMaterial>;
  private back: THREE.Mesh<THREE.SphereGeometry, THREE.MeshBasicMaterial>;
  private resizeObserver: ResizeObserver;
  private hotspotEls = new Map<string, HTMLElement>();
  private tmp = new THREE.Vector3();
  private disposed = false;

  // visao atual e alvo (para movimento suave)
  private yaw = 0;
  private pitch = 0;
  private fov = 75;
  private targetYaw = 0;
  private targetPitch = 0;
  private targetFov = 75;
  private fade: { start: number; duration: number } | null = null;

  // ponteiros (mouse/dedos)
  private pointers = new Map<number, { x: number; y: number }>();
  private pinchDist = 0;
  private keys = new Set<string>();

  current: TourScene | null = null;

  constructor(private container: HTMLElement, private tour: Tour, private opts: TourEngineOptions = {}) {
    this.renderer = new THREE.WebGLRenderer({ antialias: false, powerPreference: "high-performance" });
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    this.renderer.outputColorSpace = THREE.SRGBColorSpace;
    const canvas = this.renderer.domElement;
    canvas.style.display = "block";
    canvas.style.touchAction = "none";
    canvas.style.cursor = "grab";
    canvas.tabIndex = 0;
    canvas.setAttribute("aria-label", "Tour 360 da suíte. Arraste ou use as setas para olhar ao redor.");
    container.appendChild(canvas);

    this.camera = new THREE.PerspectiveCamera(this.fov, 1, 0.1, 100);
    this.scene.background = new THREE.Color("#0b0809");

    const makeSphere = () => {
      const geo = new THREE.SphereGeometry(50, 96, 64);
      geo.scale(-1, 1, 1); // vira a esfera do avesso: a foto fica por dentro
      const mat = new THREE.MeshBasicMaterial({ transparent: true, opacity: 0, depthWrite: false });
      const m = new THREE.Mesh(geo, mat);
      this.scene.add(m);
      return m;
    };
    this.back = makeSphere();
    this.front = makeSphere();
    this.front.renderOrder = 1;

    canvas.addEventListener("pointerdown", this.onPointerDown);
    canvas.addEventListener("pointermove", this.onPointerMove);
    canvas.addEventListener("pointerup", this.onPointerUp);
    canvas.addEventListener("pointercancel", this.onPointerUp);
    canvas.addEventListener("wheel", this.onWheel, { passive: false });
    canvas.addEventListener("keydown", this.onKeyDown);
    canvas.addEventListener("keyup", this.onKeyUp);

    this.resizeObserver = new ResizeObserver(() => this.resize());
    this.resizeObserver.observe(container);
    this.resize();
    this.renderer.setAnimationLoop(() => this.frame());

    const start = tour.scenes.find((s) => s.id === tour.start) ?? tour.scenes[0];
    if (start) this.goTo(start.id, true);
  }

  /** Carrega (uma vez) a foto de um ambiente. */
  private load(scene: TourScene) {
    let p = this.textures.get(scene.id);
    if (!p) {
      p = this.loader.loadAsync(scene.image).then((tex) => {
        tex.colorSpace = THREE.SRGBColorSpace;
        tex.generateMipmaps = false;
        tex.minFilter = THREE.LinearFilter;
        tex.anisotropy = Math.min(8, this.renderer.capabilities.getMaxAnisotropy());
        return tex;
      });
      this.textures.set(scene.id, p);
      p.catch(() => this.textures.delete(scene.id));
    }
    return p;
  }

  /** Vai para outro ambiente do tour. */
  async goTo(sceneId: string, instant = false) {
    const scene = this.tour.scenes.find((s) => s.id === sceneId);
    if (!scene || scene.id === this.current?.id) return;
    this.opts.onLoadingChange?.(true);
    let tex: THREE.Texture;
    try {
      tex = await this.load(scene);
    } catch {
      this.opts.onLoadingChange?.(false);
      this.opts.onError?.(scene.id);
      return;
    }
    if (this.disposed) return;
    this.opts.onLoadingChange?.(false);

    // a foto nova entra "atras" e aparece com fade
    [this.front, this.back] = [this.back, this.front];
    this.front.material.map = tex;
    this.front.material.needsUpdate = true;
    this.front.material.opacity = instant ? 1 : 0;
    this.front.renderOrder = 1;
    this.back.renderOrder = 0;
    this.fade = instant ? null : { start: performance.now(), duration: 700 };

    this.current = scene;
    this.yaw = this.targetYaw = scene.yaw ?? 0;
    this.pitch = this.targetPitch = scene.pitch ?? 0;
    // efeito de "caminhar": comeca um pouco mais perto e abre
    this.fov = instant ? 75 : 62;
    this.targetFov = 75;
    this.opts.onSceneChange?.(scene.id);

    // ja vai baixando os ambientes vizinhos
    for (const h of scene.hotspots) {
      if (h.kind === "link") {
        const next = this.tour.scenes.find((s) => s.id === h.to);
        if (next) this.load(next).catch(() => {});
      }
    }
  }

  /** Gira a visao ate um ponto (ex.: ao clicar num ponto de interesse). */
  lookAt(yaw: number, pitch: number) {
    // menor caminho na volta de 360
    let d = (yaw - this.targetYaw) % 360;
    if (d > 180) d -= 360;
    if (d < -180) d += 360;
    this.targetYaw += d;
    this.targetPitch = pitch;
    this.targetFov = Math.max(FOV_MIN + 10, Math.min(this.targetFov, 60));
  }

  zoomBy(factor: number) {
    this.targetFov = THREE.MathUtils.clamp(this.targetFov * factor, FOV_MIN, FOV_MAX);
  }

  registerHotspot(id: string, el: HTMLElement | null) {
    if (el) this.hotspotEls.set(id, el);
    else this.hotspotEls.delete(id);
  }

  // ---------- controles ----------
  private onPointerDown = (e: PointerEvent) => {
    (e.target as HTMLElement).setPointerCapture(e.pointerId);
    this.pointers.set(e.pointerId, { x: e.clientX, y: e.clientY });
    this.renderer.domElement.style.cursor = "grabbing";
    if (this.pointers.size === 2) this.pinchDist = this.pointerDistance();
    this.opts.onUserInteract?.();
  };

  private onPointerMove = (e: PointerEvent) => {
    const prev = this.pointers.get(e.pointerId);
    if (!prev) return;
    const cur = { x: e.clientX, y: e.clientY };
    this.pointers.set(e.pointerId, cur);
    if (this.pointers.size === 1) {
      // graus por pixel acompanham o zoom: perto = movimento mais fino
      const k = this.fov / this.container.clientHeight;
      this.targetYaw -= (cur.x - prev.x) * k;
      this.targetPitch = THREE.MathUtils.clamp(this.targetPitch + (cur.y - prev.y) * k, -85, 85);
    } else if (this.pointers.size === 2) {
      const d = this.pointerDistance();
      if (this.pinchDist > 0) this.zoomBy(this.pinchDist / d);
      this.pinchDist = d;
    }
  };

  private onPointerUp = (e: PointerEvent) => {
    this.pointers.delete(e.pointerId);
    if (this.pointers.size < 2) this.pinchDist = 0;
    if (this.pointers.size === 0) this.renderer.domElement.style.cursor = "grab";
  };

  private onWheel = (e: WheelEvent) => {
    e.preventDefault();
    this.zoomBy(e.deltaY > 0 ? 1.08 : 1 / 1.08);
    this.opts.onUserInteract?.();
  };

  private onKeyDown = (e: KeyboardEvent) => {
    if (["ArrowLeft", "ArrowRight", "ArrowUp", "ArrowDown", "+", "-", "="].includes(e.key)) {
      e.preventDefault();
      this.keys.add(e.key);
      this.opts.onUserInteract?.();
    }
  };

  private onKeyUp = (e: KeyboardEvent) => this.keys.delete(e.key);

  private pointerDistance() {
    const [a, b] = [...this.pointers.values()];
    return Math.hypot(a.x - b.x, a.y - b.y);
  }

  // ---------- desenho ----------
  private resize() {
    const w = this.container.clientWidth || 1;
    const h = this.container.clientHeight || 1;
    this.renderer.setSize(w, h, false);
    this.renderer.domElement.style.width = "100%";
    this.renderer.domElement.style.height = "100%";
    this.camera.aspect = w / h;
    const panel = w > 860 ? 376 : 0; // painel lateral no computador
    if (panel) this.camera.setViewOffset(w, h, panel / 2, 0, w, h);
    else this.camera.clearViewOffset();
    this.camera.updateProjectionMatrix();
  }

  private frame() {
    if (this.disposed) return;
    if (this.keys.has("ArrowLeft")) this.targetYaw -= 1.2;
    if (this.keys.has("ArrowRight")) this.targetYaw += 1.2;
    if (this.keys.has("ArrowUp")) this.targetPitch = Math.min(85, this.targetPitch + 1);
    if (this.keys.has("ArrowDown")) this.targetPitch = Math.max(-85, this.targetPitch - 1);
    if (this.keys.has("+") || this.keys.has("=")) this.zoomBy(0.985);
    if (this.keys.has("-")) this.zoomBy(1.015);

    // aproxima suavemente do alvo (inercia)
    this.yaw += (this.targetYaw - this.yaw) * 0.12;
    this.pitch += (this.targetPitch - this.pitch) * 0.12;
    this.fov += (this.targetFov - this.fov) * 0.1;

    if (this.fade) {
      const k = Math.min(1, (performance.now() - this.fade.start) / this.fade.duration);
      this.front.material.opacity = k;
      this.back.material.opacity = 1 - k;
      if (k >= 1) this.fade = null;
    }

    this.camera.fov = this.fov;
    this.camera.updateProjectionMatrix();
    this.camera.lookAt(directionOf(this.yaw, this.pitch, this.tmp));
    this.renderer.render(this.scene, this.camera);
    this.placeHotspots();
  }

  private placeHotspots() {
    const scene = this.current;
    if (!scene) return;
    const w = this.container.clientWidth;
    const h = this.container.clientHeight;
    for (const hs of scene.hotspots) {
      const el = this.hotspotEls.get(hs.id);
      if (!el) continue;
      directionOf(hs.yaw, hs.pitch, this.tmp).multiplyScalar(10).project(this.camera);
      if (this.tmp.z > 1 || this.fade) {
        el.style.opacity = "0";
        el.style.pointerEvents = "none";
        continue;
      }
      const x = (this.tmp.x * 0.5 + 0.5) * w;
      const y = (-this.tmp.y * 0.5 + 0.5) * h;
      el.style.transform = `translate(${x}px, ${y}px) translate(-50%, -50%)`;
      el.style.opacity = "1";
      el.style.pointerEvents = "auto";
    }
  }

  dispose() {
    this.disposed = true;
    this.renderer.setAnimationLoop(null);
    this.resizeObserver.disconnect();
    const c = this.renderer.domElement;
    c.removeEventListener("pointerdown", this.onPointerDown);
    c.removeEventListener("pointermove", this.onPointerMove);
    c.removeEventListener("pointerup", this.onPointerUp);
    c.removeEventListener("pointercancel", this.onPointerUp);
    c.removeEventListener("wheel", this.onWheel);
    c.removeEventListener("keydown", this.onKeyDown);
    c.removeEventListener("keyup", this.onKeyUp);
    for (const p of this.textures.values()) p.then((t) => t.dispose()).catch(() => {});
    for (const m of [this.front, this.back]) {
      m.geometry.dispose();
      m.material.dispose();
    }
    this.renderer.dispose();
    c.remove();
  }
}
