import * as THREE from "three";
import { OrbitControls } from "three/examples/jsm/controls/OrbitControls.js";
import { HDRLoader } from "three/examples/jsm/loaders/HDRLoader.js";
import { RectAreaLightUniformsLib } from "three/examples/jsm/lights/RectAreaLightUniformsLib.js";
import { FullScreenQuad } from "three/examples/jsm/postprocessing/Pass.js";
import { buildRealisticSuite, type RealisticSuite } from "./realistic/suite";
import type { LightSceneId } from "./types";

// =====================================================================
// MOTOR DO VISUALIZADOR 3D REALISTA (Three.js / WebGL 2)
//
// Duas formas de desenhar a mesma cena:
//  1) Rapida (rasterizacao): usada enquanto a camera se move e no celular.
//  2) Fotografica (path tracing): quando a camera para dentro da suite, a
//     luz e calculada rebatendo nas superficies (iluminacao global,
//     sombras suaves, reflexos reais no espelho e no marmore). A imagem
//     vai ficando mais limpa a cada passada, com reducao de ruido.
//
// Navegacao: orbita 360 (girar/aproximar/arrastar), angulos prontos com
// voo suave, vista de cima e modo exploracao em 1a pessoa.
// =====================================================================

export type EngineStatus =
  | { kind: "loading"; progress: number }
  | { kind: "ready" }
  | { kind: "error" };

export type PhotoState = {
  enabled: boolean;
  /** false fora da suite (vistas de cima/maquete) */
  available: boolean;
  samples: number;
  target: number;
  preparing: boolean;
};

export type EngineOptions = {
  quality: "high" | "low";
  photoMode: boolean;
  onStatus?: (s: EngineStatus) => void;
  onUserInteract?: () => void;
  onPhoto?: (p: PhotoState) => void;
  onWalkChange?: (walking: boolean) => void;
};

type Flight = {
  fromPos: THREE.Vector3;
  toPos: THREE.Vector3;
  fromTarget: THREE.Vector3;
  toTarget: THREE.Vector3;
  start: number;
  duration: number;
};

type PathTracer = import("three-gpu-pathtracer").WebGLPathTracer;

const ease = (k: number) => (k < 0.5 ? 4 * k * k * k : 1 - Math.pow(-2 * k + 2, 3) / 2);

export function isWebGLAvailable(): boolean {
  try {
    const c = document.createElement("canvas");
    return Boolean(window.WebGL2RenderingContext && c.getContext("webgl2"));
  } catch {
    return false;
  }
}

export class SuiteViewerEngine {
  suite: RealisticSuite | null = null;
  private renderer: THREE.WebGLRenderer;
  private scene = new THREE.Scene();
  private camera: THREE.PerspectiveCamera;
  private controls: OrbitControls;
  private timer = new THREE.Timer();
  private flight: Flight | null = null;
  private hotspotEls = new Map<string, HTMLElement>();
  private hotspotPos = new Map<string, THREE.Vector3>();
  private resizeObserver: ResizeObserver;
  private tmp = new THREE.Vector3();
  private disposed = false;

  // modo fotografico
  private photoEnabled: boolean;
  private pathTracer: PathTracer | null = null;
  private ptReady = false;
  private ptBuilding = false;
  private denoiseQuad: FullScreenQuad | null = null;
  private lastCam = new THREE.Matrix4();
  private lastPhoto = "";
  private maxSamples: number;

  // modo exploracao (1a pessoa)
  private walking = false;
  private yaw = 0;
  private pitch = 0;
  private walkTarget: THREE.Vector3 | null = null;
  private keys = new Set<string>();
  private pointer: { id: number; x: number; y: number; moved: number } | null = null;
  private raycaster = new THREE.Raycaster();

  constructor(private container: HTMLElement, private opts: EngineOptions) {
    const high = opts.quality === "high";
    this.photoEnabled = opts.photoMode;
    this.maxSamples = high ? 600 : 200;

    this.renderer = new THREE.WebGLRenderer({ antialias: high, powerPreference: "high-performance" });
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, high ? 1.75 : 1.25));
    this.renderer.outputColorSpace = THREE.SRGBColorSpace;
    this.renderer.toneMapping = THREE.AgXToneMapping;
    this.renderer.toneMappingExposure = 1;
    this.renderer.shadowMap.enabled = true;
    this.renderer.shadowMap.type = THREE.PCFShadowMap;
    const canvas = this.renderer.domElement;
    canvas.style.display = "block";
    canvas.style.touchAction = "none";
    canvas.tabIndex = 0;
    canvas.setAttribute("aria-label", "Visualização 3D interativa da suíte");
    container.appendChild(canvas);
    RectAreaLightUniformsLib.init();

    this.scene.background = new THREE.Color("#060505");
    this.camera = new THREE.PerspectiveCamera(55, 1, 0.03, 80);

    this.controls = new OrbitControls(this.camera, canvas);
    this.controls.enableDamping = true;
    this.controls.dampingFactor = 0.08;
    this.controls.rotateSpeed = 0.5;
    this.controls.zoomSpeed = 0.9;
    this.controls.panSpeed = 0.7;
    this.controls.screenSpacePanning = false;
    this.controls.minDistance = 0.35;
    this.controls.maxDistance = 16;
    this.controls.maxPolarAngle = Math.PI * 0.6;
    this.controls.addEventListener("start", () => {
      this.flight = null;
      this.opts.onUserInteract?.();
    });

    canvas.addEventListener("pointerdown", this.onPointerDown);
    canvas.addEventListener("pointermove", this.onPointerMove);
    canvas.addEventListener("pointerup", this.onPointerUp);
    canvas.addEventListener("pointercancel", this.onPointerUp);
    window.addEventListener("keydown", this.onKeyDown);
    window.addEventListener("keyup", this.onKeyUp);

    this.resizeObserver = new ResizeObserver(() => this.resize());
    this.resizeObserver.observe(container);
    this.resize();
    this.renderer.setAnimationLoop(() => this.frame());

    this.load().catch(() => this.opts.onStatus?.({ kind: "error" }));
  }

  // ---------- carregamento progressivo ----------
  private async load() {
    this.opts.onStatus?.({ kind: "loading", progress: 0 });
    const hdrPromise = new HDRLoader().loadAsync("/suite3d/hdri/warm_bar_1k.hdr");
    const suite = await buildRealisticSuite({
      quality: this.opts.quality,
      renderer: this.renderer,
      onProgress: (loaded, total) => this.opts.onStatus?.({ kind: "loading", progress: total ? loaded / total : 0 }),
    });
    if (this.disposed) return;
    const hdr = await hdrPromise;
    hdr.mapping = THREE.EquirectangularReflectionMapping;
    this.scene.environment = hdr;
    this.scene.environmentIntensity = 0.12;

    this.suite = suite;
    this.scene.add(suite.root);
    for (const h of suite.hotspots) this.hotspotPos.set(h.id, new THREE.Vector3(...h.position));
    this.goToPreset(suite.presets[0].id, true);
    // a arquitetura ja aparece; os moveis vao surgindo conforme carregam
    this.opts.onStatus?.({ kind: "ready" });

    await suite.modelsReady;
    if (this.disposed) return;
    if (this.photoEnabled) this.preparePathTracer();
  }

  // ---------- modo fotografico ----------
  setPhotoMode(on: boolean) {
    this.photoEnabled = on;
    if (on && !this.pathTracer && this.suite) this.preparePathTracer();
    this.pathTracer?.reset();
    this.emitPhoto(true);
  }

  private async preparePathTracer() {
    if (this.ptBuilding || this.pathTracer || !this.suite) return;
    this.ptBuilding = true;
    this.emitPhoto(true);
    try {
      const { WebGLPathTracer, DenoiseMaterial } = await import("three-gpu-pathtracer");
      if (this.disposed) return;
      const pt = new WebGLPathTracer(this.renderer);
      const high = this.opts.quality === "high";
      pt.tiles.set(high ? 2 : 3, high ? 2 : 3);
      pt.bounces = high ? 6 : 4;
      pt.transmissiveBounces = 6;
      pt.filterGlossyFactor = 0.5;
      pt.minSamples = 3;
      pt.renderDelay = 220;
      pt.fadeDuration = 350;
      pt.renderScale = high ? 1 : 0.6;
      pt.multipleImportanceSampling = true;
      // reducao de ruido aplicada na imagem final
      const denoise = new DenoiseMaterial({ transparent: true, opacity: 1, premultipliedAlpha: false });
      this.denoiseQuad = new FullScreenQuad(denoise);
      pt.renderToCanvasCallback = (target, renderer, quad) => {
        const qm = quad.material as THREE.ShaderMaterial & { opacity: number };
        denoise.map = target.texture;
        denoise.opacity = qm.opacity;
        denoise.blending = qm.blending;
        // menos filtro conforme a imagem fica limpa
        denoise.sigma = Math.max(1.5, 5 - pt.samples / 40);
        const auto = renderer.autoClear;
        renderer.autoClear = false;
        this.denoiseQuad!.render(renderer);
        renderer.autoClear = auto;
      };
      // a cena do path tracer usa todas as paredes visiveis (so roda dentro da suite)
      this.withAllWallsVisible(() => pt.setScene(this.scene, this.camera));
      this.pathTracer = pt;
      this.ptReady = true;
      this.lastCam.copy(this.camera.matrixWorld);
    } catch {
      this.photoEnabled = false;
    } finally {
      this.ptBuilding = false;
      this.emitPhoto(true);
    }
  }

  private withAllWallsVisible(fn: () => void) {
    const groups = this.suite!.root.children.filter((c) => (c as THREE.Group).isGroup);
    const prev = groups.map((g) => g.visible);
    groups.forEach((g) => (g.visible = true));
    fn();
    groups.forEach((g, i) => (g.visible = prev[i]));
  }

  private photoActive() {
    return Boolean(this.photoEnabled && this.ptReady && this.pathTracer && this.suite?.isInside(this.camera.position));
  }

  private emitPhoto(force = false) {
    const st: PhotoState = {
      enabled: this.photoEnabled,
      available: Boolean(this.suite?.isInside(this.camera.position)),
      samples: this.photoActive() ? Math.floor(this.pathTracer!.samples) : 0,
      target: this.maxSamples,
      preparing: this.ptBuilding,
    };
    const key = `${st.enabled}|${st.available}|${Math.floor(st.samples / 10)}|${st.preparing}`;
    if (force || key !== this.lastPhoto) {
      this.lastPhoto = key;
      this.opts.onPhoto?.(st);
    }
  }

  // ---------- navegacao ----------
  private presetPosition(p: { id: string; position: [number, number, number]; target: [number, number, number] }) {
    const pos = new THREE.Vector3(...p.position);
    const narrow = this.container.clientWidth / Math.max(1, this.container.clientHeight) < 0.8;
    if (narrow && (p.id === "geral" || p.id === "cima")) {
      const target = new THREE.Vector3(...p.target);
      pos.sub(target).multiplyScalar(1.5).add(target);
    }
    return pos;
  }

  goToPreset(presetId: string, instant = false) {
    const p = this.suite?.presets.find((x) => x.id === presetId);
    if (!p) return;
    if (this.walking) this.setWalking(false);
    const toPos = this.presetPosition(p);
    const toTarget = new THREE.Vector3(...p.target);
    if (instant) {
      this.camera.position.copy(toPos);
      this.controls.target.copy(toTarget);
      this.controls.update();
      return;
    }
    this.flight = { fromPos: this.camera.position.clone(), toPos, fromTarget: this.controls.target.clone(), toTarget, start: performance.now(), duration: 1500 };
  }

  focusHotspot(id: string) {
    const pos = this.hotspotPos.get(id);
    if (!pos || !this.suite) return;
    if (this.walking) {
      // no modo exploracao so vira o olhar para o ponto
      const d = pos.clone().sub(this.camera.position);
      this.yaw = Math.atan2(-d.x, -d.z);
      this.pitch = Math.atan2(d.y, Math.hypot(d.x, d.z));
      return;
    }
    const dir = this.camera.position.clone().sub(pos).setY(0);
    if (dir.lengthSq() < 1e-4) dir.set(1, 0, 1);
    dir.normalize();
    const toPos = pos.clone().add(dir.multiplyScalar(1.9)).setY(Math.max(pos.y + 0.45, 1.25));
    const b = this.suite.walkBounds;
    toPos.x = THREE.MathUtils.clamp(toPos.x, b.min.x, b.max.x);
    toPos.z = THREE.MathUtils.clamp(toPos.z, b.min.z, b.max.z);
    this.flight = { fromPos: this.camera.position.clone(), toPos, fromTarget: this.controls.target.clone(), toTarget: pos.clone(), start: performance.now(), duration: 1200 };
  }

  zoomBy(factor: number) {
    if (this.walking) {
      this.camera.fov = THREE.MathUtils.clamp(this.camera.fov * factor, 30, 80);
      this.camera.updateProjectionMatrix();
      return;
    }
    const offset = this.camera.position.clone().sub(this.controls.target);
    const len = THREE.MathUtils.clamp(offset.length() * factor, this.controls.minDistance, this.controls.maxDistance);
    this.flight = {
      fromPos: this.camera.position.clone(),
      toPos: this.controls.target.clone().add(offset.setLength(len)),
      fromTarget: this.controls.target.clone(),
      toTarget: this.controls.target.clone(),
      start: performance.now(),
      duration: 350,
    };
  }

  setLightScene(id: LightSceneId) {
    if (!this.suite) return;
    this.suite.setLightScene(id);
    this.renderer.toneMappingExposure = this.suite.getExposure();
    if (this.pathTracer) {
      this.pathTracer.updateLights();
      this.pathTracer.updateMaterials();
    }
  }

  // ---------- modo exploracao (1a pessoa) ----------
  setWalking(on: boolean) {
    if (!this.suite || on === this.walking) return;
    this.walking = on;
    this.flight = null;
    this.controls.enabled = !on;
    if (on) {
      // comeca na entrada, na altura dos olhos, olhando para a cama
      const start = this.suite.presets.find((p) => p.id === "entrada")!;
      this.camera.position.set(start.position[0], this.suite.eyeHeight, start.position[2]);
      const d = new THREE.Vector3(...start.target).sub(this.camera.position);
      this.yaw = Math.atan2(-d.x, -d.z);
      this.pitch = -0.12;
      this.camera.fov = 62;
    } else {
      this.camera.fov = this.container.clientWidth / this.container.clientHeight < 0.8 ? 68 : 55;
      const look = new THREE.Vector3(0, 0, -1).applyEuler(new THREE.Euler(this.pitch, this.yaw, 0, "YXZ"));
      this.controls.target.copy(this.camera.position).add(look.multiplyScalar(1.5));
    }
    this.camera.updateProjectionMatrix();
    this.opts.onWalkChange?.(on);
  }

  private onPointerDown = (e: PointerEvent) => {
    if (!this.walking) return;
    (e.target as HTMLElement).setPointerCapture?.(e.pointerId);
    this.pointer = { id: e.pointerId, x: e.clientX, y: e.clientY, moved: 0 };
    this.opts.onUserInteract?.();
  };

  private onPointerMove = (e: PointerEvent) => {
    if (!this.walking || !this.pointer || e.pointerId !== this.pointer.id) return;
    const dx = e.clientX - this.pointer.x;
    const dy = e.clientY - this.pointer.y;
    this.pointer.moved += Math.abs(dx) + Math.abs(dy);
    this.pointer.x = e.clientX;
    this.pointer.y = e.clientY;
    const k = (this.camera.fov * Math.PI) / 180 / this.container.clientHeight;
    this.yaw += dx * k;
    this.pitch = THREE.MathUtils.clamp(this.pitch + dy * k, -1.2, 1.2);
    this.walkTarget = null;
  };

  private onPointerUp = (e: PointerEvent) => {
    if (!this.walking || !this.pointer || e.pointerId !== this.pointer.id) return;
    const tap = this.pointer.moved < 8;
    this.pointer = null;
    if (!tap || !this.suite) return;
    // toque/clique no chao: caminha ate o ponto
    const rect = this.renderer.domElement.getBoundingClientRect();
    const ndc = new THREE.Vector2(((e.clientX - rect.left) / rect.width) * 2 - 1, -((e.clientY - rect.top) / rect.height) * 2 + 1);
    this.raycaster.setFromCamera(ndc, this.camera);
    const hit = new THREE.Vector3();
    if (this.raycaster.ray.intersectPlane(new THREE.Plane(new THREE.Vector3(0, 1, 0), 0), hit)) {
      const b = this.suite.walkBounds;
      hit.x = THREE.MathUtils.clamp(hit.x, b.min.x, b.max.x);
      hit.z = THREE.MathUtils.clamp(hit.z, b.min.z, b.max.z);
      hit.y = this.suite.eyeHeight;
      this.walkTarget = hit;
    }
  };

  private onKeyDown = (e: KeyboardEvent) => {
    if (!this.walking) return;
    const k = e.key.toLowerCase();
    if (["w", "a", "s", "d", "arrowup", "arrowdown", "arrowleft", "arrowright"].includes(k)) {
      e.preventDefault();
      this.keys.add(k);
      this.walkTarget = null;
      this.opts.onUserInteract?.();
    }
    if (k === "escape") this.setWalking(false);
  };

  private onKeyUp = (e: KeyboardEvent) => {
    this.keys.delete(e.key.toLowerCase());
  };

  private updateWalk(dt: number) {
    if (!this.suite) return;
    const speed = 1.4; // m/s, passo tranquilo
    const fwd = new THREE.Vector3(-Math.sin(this.yaw), 0, -Math.cos(this.yaw));
    const right = new THREE.Vector3(-fwd.z, 0, fwd.x);
    const move = new THREE.Vector3();
    if (this.keys.has("w") || this.keys.has("arrowup")) move.add(fwd);
    if (this.keys.has("s") || this.keys.has("arrowdown")) move.sub(fwd);
    if (this.keys.has("d")) move.add(right);
    if (this.keys.has("a")) move.sub(right);
    if (this.keys.has("arrowleft")) this.yaw += 1.6 * dt;
    if (this.keys.has("arrowright")) this.yaw -= 1.6 * dt;
    if (move.lengthSq() > 0) this.camera.position.addScaledVector(move.normalize(), speed * dt);
    if (this.walkTarget) {
      const d = this.walkTarget.clone().sub(this.camera.position);
      const dist = d.length();
      if (dist < 0.03) this.walkTarget = null;
      else this.camera.position.addScaledVector(d.normalize(), Math.min(dist, speed * dt * Math.min(1, dist * 2 + 0.3)));
    }
    const b = this.suite.walkBounds;
    this.camera.position.x = THREE.MathUtils.clamp(this.camera.position.x, b.min.x, b.max.x);
    this.camera.position.z = THREE.MathUtils.clamp(this.camera.position.z, b.min.z, b.max.z);
    this.camera.position.y = this.suite.eyeHeight;
    this.camera.rotation.set(this.pitch, this.yaw, 0, "YXZ");
  }

  registerHotspot(id: string, el: HTMLElement | null) {
    if (el) this.hotspotEls.set(id, el);
    else this.hotspotEls.delete(id);
  }

  // ---------- desenho ----------
  private resize() {
    const w = this.container.clientWidth || 1;
    const h = this.container.clientHeight || 1;
    this.renderer.setSize(w, h, false);
    this.renderer.domElement.style.width = "100%";
    this.renderer.domElement.style.height = "100%";
    this.camera.aspect = w / h;
    if (!this.walking) this.camera.fov = w / h < 0.8 ? 68 : 55;
    const panel = w > 860 ? 376 : 0;
    if (panel) this.camera.setViewOffset(w, h, panel / 2, 0, w, h);
    else this.camera.clearViewOffset();
    this.camera.updateProjectionMatrix();
    this.pathTracer?.updateCamera();
  }

  private frame() {
    if (this.disposed) return;
    this.timer.update();
    const dt = Math.min(this.timer.getDelta(), 0.05);

    if (this.walking) {
      this.updateWalk(dt);
    } else {
      if (this.flight) {
        const f = this.flight;
        const k = ease(Math.min(1, (performance.now() - f.start) / f.duration));
        this.camera.position.lerpVectors(f.fromPos, f.toPos, k);
        this.controls.target.lerpVectors(f.fromTarget, f.toTarget, k);
        if (k >= 1) this.flight = null;
      }
      this.controls.update();
      if (this.suite) this.controls.target.clamp(this.suite.bounds.min, this.suite.bounds.max);
      if (this.camera.position.y < 0.25) this.camera.position.y = 0.25;
    }
    this.camera.updateMatrixWorld();

    if (this.suite) this.suite.update(this.timer.getElapsed(), this.camera);

    if (this.photoActive()) {
      const pt = this.pathTracer!;
      if (!this.lastCam.equals(this.camera.matrixWorld)) {
        this.lastCam.copy(this.camera.matrixWorld);
        pt.updateCamera();
      }
      pt.pausePathTracing = pt.samples >= this.maxSamples;
      pt.renderSample();
    } else {
      this.renderer.render(this.scene, this.camera);
    }
    this.emitPhoto();
    this.placeHotspots();
  }

  private placeHotspots() {
    const w = this.container.clientWidth;
    const h = this.container.clientHeight;
    for (const [id, el] of this.hotspotEls) {
      const pos = this.hotspotPos.get(id);
      if (!pos) continue;
      this.tmp.copy(pos).project(this.camera);
      const behind = this.tmp.z > 1;
      const dist = this.camera.position.distanceTo(pos);
      const hidden = this.suite?.isHotspotVisible ? !this.suite.isHotspotVisible(id) : false;
      if (behind || hidden || dist < 0.6) {
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
    this.controls.dispose();
    const c = this.renderer.domElement;
    c.removeEventListener("pointerdown", this.onPointerDown);
    c.removeEventListener("pointermove", this.onPointerMove);
    c.removeEventListener("pointerup", this.onPointerUp);
    c.removeEventListener("pointercancel", this.onPointerUp);
    window.removeEventListener("keydown", this.onKeyDown);
    window.removeEventListener("keyup", this.onKeyUp);
    this.pathTracer?.dispose();
    this.denoiseQuad?.dispose();
    this.scene.traverse((obj) => {
      const mesh = obj as THREE.Mesh;
      if (mesh.geometry) mesh.geometry.dispose();
      const mats = mesh.material ? (Array.isArray(mesh.material) ? mesh.material : [mesh.material]) : [];
      for (const m of mats) {
        for (const v of Object.values(m)) if (v instanceof THREE.Texture) v.dispose();
        m.dispose();
      }
    });
    (this.scene.environment as THREE.Texture | null)?.dispose();
    this.renderer.dispose();
    c.remove();
  }
}
