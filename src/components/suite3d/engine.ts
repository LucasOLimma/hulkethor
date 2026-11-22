import * as THREE from "three";
import { OrbitControls } from "three/examples/jsm/controls/OrbitControls.js";
import { RoomEnvironment } from "three/examples/jsm/environments/RoomEnvironment.js";
import { RectAreaLightUniformsLib } from "three/examples/jsm/lights/RectAreaLightUniformsLib.js";
import { buildDemoSuite } from "./demo-suite";
import type { LightSceneId, SuiteScene } from "./types";

// =====================================================================
// MOTOR DO VISUALIZADOR 3D (Three.js / WebGL)
// - Camera com orbita 360, zoom, arrastar (mouse e toque).
// - Voo suave entre angulos prontos.
// - Posiciona os "pontos de interesse" (HTML) sobre a cena.
// - Ajusta a qualidade no celular (sombras/resolucao).
// Este arquivo so e baixado na pagina do visualizador (import dinamico).
// =====================================================================

export type EngineOptions = {
  quality: "high" | "low";
  onUserInteract?: () => void;
};

type Flight = {
  fromPos: THREE.Vector3;
  toPos: THREE.Vector3;
  fromTarget: THREE.Vector3;
  toTarget: THREE.Vector3;
  start: number;
  duration: number;
};

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
  readonly suite: SuiteScene;
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

  constructor(private container: HTMLElement, private opts: EngineOptions) {
    const high = opts.quality === "high";

    this.renderer = new THREE.WebGLRenderer({ antialias: high, powerPreference: "high-performance" });
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, high ? 2 : 1.5));
    this.renderer.outputColorSpace = THREE.SRGBColorSpace;
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
    this.renderer.shadowMap.enabled = high;
    this.renderer.shadowMap.type = THREE.PCFShadowMap;
    this.renderer.domElement.style.display = "block";
    this.renderer.domElement.style.touchAction = "none";
    this.renderer.domElement.setAttribute("aria-label", "Visualização 3D interativa da suíte");
    container.appendChild(this.renderer.domElement);

    RectAreaLightUniformsLib.init();

    // Reflexos realistas (ambiente gerado, sem baixar imagem externa)
    const pmrem = new THREE.PMREMGenerator(this.renderer);
    this.scene.environment = pmrem.fromScene(new RoomEnvironment(), 0.04).texture;
    this.scene.environmentIntensity = 0.18;
    pmrem.dispose();
    this.scene.background = new THREE.Color("#0b0809");
    this.scene.fog = new THREE.Fog("#0b0809", 16, 30);

    this.camera = new THREE.PerspectiveCamera(55, 1, 0.05, 60);

    // Suite demonstrativa (na etapa 4: tambem modelos .glb do motel)
    this.suite = buildDemoSuite({ quality: opts.quality });
    this.scene.add(this.suite.root);
    this.renderer.toneMappingExposure = this.suite.getExposure();

    // Controles de camera
    this.controls = new OrbitControls(this.camera, this.renderer.domElement);
    this.controls.enableDamping = true;
    this.controls.dampingFactor = 0.08;
    this.controls.rotateSpeed = 0.55;
    this.controls.zoomSpeed = 0.9;
    this.controls.panSpeed = 0.7;
    this.controls.screenSpacePanning = false; // arrastar = andar pelo piso
    this.controls.minDistance = 0.4;
    this.controls.maxDistance = 14;
    this.controls.maxPolarAngle = Math.PI * 0.62;
    this.controls.addEventListener("start", () => {
      this.flight = null;
      this.opts.onUserInteract?.();
    });

    // (a posicao inicial e definida depois do primeiro ajuste de tamanho)

    for (const h of this.suite.hotspots) this.hotspotPos.set(h.id, new THREE.Vector3(...h.position));

    this.resizeObserver = new ResizeObserver(() => this.resize());
    this.resizeObserver.observe(container);
    this.resize();

    const first = this.suite.presets[0];
    this.camera.position.copy(this.presetPosition(first));
    this.controls.target.set(...first.target);
    this.controls.update();

    this.renderer.setAnimationLoop(() => this.frame());
  }

  /** Posicao da camera para um angulo pronto. Em tela estreita (celular
   *  em pe) a visao geral recua um pouco para o quarto caber inteiro. */
  private presetPosition(p: { id: string; position: [number, number, number]; target: [number, number, number] }) {
    const pos = new THREE.Vector3(...p.position);
    const narrow = this.container.clientWidth / Math.max(1, this.container.clientHeight) < 0.8;
    if (narrow && p.id === this.suite.presets[0]?.id) {
      const target = new THREE.Vector3(...p.target);
      pos.sub(target).multiplyScalar(1.55).add(target);
    }
    return pos;
  }

  /** Voa suavemente ate um angulo pronto (ex.: "cama"). */
  flyTo(presetId: string) {
    const p = this.suite.presets.find((x) => x.id === presetId);
    if (!p) return;
    this.flight = {
      fromPos: this.camera.position.clone(),
      toPos: this.presetPosition(p),
      fromTarget: this.controls.target.clone(),
      toTarget: new THREE.Vector3(...p.target),
      start: performance.now(),
      duration: 1400,
    };
  }

  /** Aproxima a camera de um ponto de interesse. */
  focusHotspot(id: string) {
    const pos = this.hotspotPos.get(id);
    if (!pos) return;
    const dir = this.camera.position.clone().sub(pos).setY(0).normalize();
    const toPos = pos.clone().add(dir.multiplyScalar(2.2)).setY(Math.max(pos.y + 0.6, 1.3));
    const b = this.suite.bounds;
    toPos.x = THREE.MathUtils.clamp(toPos.x, b.min.x, b.max.x);
    toPos.z = THREE.MathUtils.clamp(toPos.z, b.min.z, b.max.z);
    this.flight = {
      fromPos: this.camera.position.clone(),
      toPos,
      fromTarget: this.controls.target.clone(),
      toTarget: pos.clone(),
      start: performance.now(),
      duration: 1100,
    };
  }

  setLightScene(id: LightSceneId) {
    this.suite.setLightScene(id);
    this.renderer.toneMappingExposure = this.suite.getExposure();
  }

  zoomBy(factor: number) {
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

  /** Liga os elementos HTML dos pontos de interesse a posicoes 3D. */
  registerHotspot(id: string, el: HTMLElement | null) {
    if (el) this.hotspotEls.set(id, el);
    else this.hotspotEls.delete(id);
  }

  private resize() {
    const w = this.container.clientWidth || 1;
    const h = this.container.clientHeight || 1;
    this.renderer.setSize(w, h, false);
    this.renderer.domElement.style.width = "100%";
    this.renderer.domElement.style.height = "100%";
    this.camera.aspect = w / h;
    // tela estreita (celular em pe): abre um pouco mais o angulo de visao
    this.camera.fov = w / h < 0.8 ? 68 : 55;
    // no computador o painel de informacoes ocupa a direita: desloca o
    // centro da imagem para o meio do espaco livre
    const panel = w > 860 ? 376 : 0;
    if (panel) this.camera.setViewOffset(w, h, panel / 2, 0, w, h);
    else this.camera.clearViewOffset();
    this.camera.updateProjectionMatrix();
  }

  private frame() {
    if (this.disposed) return;
    const now = performance.now();

    if (this.flight) {
      const f = this.flight;
      const k = ease(Math.min(1, (now - f.start) / f.duration));
      this.camera.position.lerpVectors(f.fromPos, f.toPos, k);
      this.controls.target.lerpVectors(f.fromTarget, f.toTarget, k);
      if (k >= 1) this.flight = null;
    }

    this.controls.update();
    // o alvo da camera nao sai do quarto; a camera nao atravessa o piso
    this.controls.target.clamp(this.suite.bounds.min, this.suite.bounds.max);
    if (this.camera.position.y < 0.25) this.camera.position.y = 0.25;

    this.timer.update();
    this.suite.update(this.timer.getElapsed(), this.camera);
    this.renderer.render(this.scene, this.camera);
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
      const hidden = this.suite.isHotspotVisible ? !this.suite.isHotspotVisible(id) : false;
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
    this.scene.traverse((obj) => {
      const mesh = obj as THREE.Mesh;
      if (mesh.geometry) mesh.geometry.dispose();
      const mats = mesh.material ? (Array.isArray(mesh.material) ? mesh.material : [mesh.material]) : [];
      for (const m of mats) {
        for (const v of Object.values(m)) if (v instanceof THREE.Texture) v.dispose();
        m.dispose();
      }
    });
    this.scene.environment?.dispose();
    this.renderer.dispose();
    this.renderer.domElement.remove();
  }
}
