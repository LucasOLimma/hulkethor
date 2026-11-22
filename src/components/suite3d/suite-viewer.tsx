"use client";

import { useEffect, useRef, useState } from "react";
import type { SuiteViewerEngine } from "./engine";
import type { CameraPreset, HotspotDef, LightSceneId, SuiteInfo } from "./types";
import styles from "./suite-viewer.module.css";

const LIGHT_SCENES: { id: LightSceneId; label: string; dot: string }[] = [
  { id: "aconchegante", label: "Aconchegante", dot: "#ffa45c" },
  { id: "romantico", label: "Romântico", dot: "#ff2a6d" },
  { id: "claro", label: "Claro", dot: "#fff0dc" },
];

type Status = "loading" | "ready" | "unsupported" | "error";

export function SuiteViewer({
  info,
  badge,
  onReserve,
}: {
  info: SuiteInfo;
  badge?: string;
  onReserve?: () => void;
}) {
  const rootRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLDivElement>(null);
  const engineRef = useRef<SuiteViewerEngine | null>(null);

  const [status, setStatus] = useState<Status>("loading");
  const [hotspots, setHotspots] = useState<HotspotDef[]>([]);
  const [presets, setPresets] = useState<CameraPreset[]>([]);
  const [view, setView] = useState<"3d" | "fotos">("3d");
  const [preset, setPreset] = useState("geral");
  const [lightScene, setLightScene] = useState<LightSceneId>("aconchegante");
  const [activeHotspot, setActiveHotspot] = useState<string | null>(null);
  const [panelOpen, setPanelOpen] = useState(false);
  const [hint, setHint] = useState(true);
  const [notice, setNotice] = useState<string | null>(null);
  const [canFullscreen, setCanFullscreen] = useState(false);

  // Carrega o motor 3D so no navegador (nao pesa nas outras paginas).
  useEffect(() => {
    let engine: SuiteViewerEngine | null = null;
    let cancelled = false;
    import("./engine")
      .then(({ SuiteViewerEngine, isWebGLAvailable }) => {
        if (cancelled || !canvasRef.current) return;
        setCanFullscreen(Boolean(document.fullscreenEnabled));
        if (!isWebGLAvailable()) {
          setStatus("unsupported");
          return;
        }
        const lowEnd =
          window.matchMedia("(pointer: coarse)").matches || window.innerWidth < 768;
        engine = new SuiteViewerEngine(canvasRef.current, {
          quality: lowEnd ? "low" : "high",
          onUserInteract: () => {
            setHint(false);
            setPreset("");
          },
        });
        engineRef.current = engine;
        setHotspots(engine.suite.hotspots);
        setPresets(engine.suite.presets);
        setStatus("ready");
      })
      .catch(() => {
        if (!cancelled) setStatus("error");
      });
    return () => {
      cancelled = true;
      engine?.dispose();
      engineRef.current = null;
    };
  }, []);

  // Esc fecha o cartao do ponto de interesse
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setActiveHotspot(null);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  const goTo = (id: string) => {
    setPreset(id);
    setActiveHotspot(null);
    setHint(false);
    engineRef.current?.flyTo(id);
  };

  const openHotspot = (id: string) => {
    setActiveHotspot(id);
    setHint(false);
    setPreset("");
    engineRef.current?.focusHotspot(id);
  };

  const changeLight = (id: LightSceneId) => {
    setLightScene(id);
    engineRef.current?.setLightScene(id);
  };

  const toggleFullscreen = () => {
    if (document.fullscreenElement) document.exitFullscreen();
    else rootRef.current?.requestFullscreen().catch(() => {});
  };

  const reserve = () => {
    if (onReserve) onReserve();
    else setNotice("As reservas online chegam na próxima etapa do sistema.");
  };

  const current = hotspots.find((h) => h.id === activeHotspot);
  const lowestPrice = info.prices[0];

  return (
    <div ref={rootRef} className={styles.root}>
      {/* ---------- area 3D ---------- */}
      <div ref={canvasRef} className={styles.canvas} hidden={view !== "3d"} />

      {view === "3d" && status === "ready" && (
        <div className={styles.hotspotLayer} aria-label="Pontos de interesse">
          {hotspots.map((h) => (
            <button
              key={h.id}
              ref={(el) => engineRef.current?.registerHotspot(h.id, el)}
              type="button"
              className={`${styles.hotspot} ${activeHotspot === h.id ? styles.hotspotActive : ""}`}
              onClick={() => openHotspot(h.id)}
              aria-label={h.title}
            >
              <span className={styles.hotspotDot} />
              <span className={styles.hotspotLabel}>{h.title}</span>
            </button>
          ))}
        </div>
      )}

      {status === "loading" && (
        <div className={styles.overlay}>
          <span className={styles.spinner} aria-hidden="true" />
          <p>Preparando a suíte em 3D…</p>
        </div>
      )}
      {(status === "unsupported" || status === "error") && (
        <div className={styles.overlay}>
          <p className={styles.overlayTitle}>Não foi possível abrir o 3D neste aparelho</p>
          <p>
            {status === "unsupported"
              ? "Seu navegador não tem suporte a WebGL 2. Atualize o navegador ou use outro aparelho."
              : "Ocorreu um erro ao carregar. Recarregue a página."}
          </p>
          {info.photos.length > 0 && (
            <button type="button" className={styles.goldBtn} onClick={() => setView("fotos")}>
              Ver fotos da suíte
            </button>
          )}
        </div>
      )}

      {/* ---------- fotos reais ---------- */}
      {view === "fotos" && (
        <div className={styles.photos}>
          {info.photos.length === 0 ? (
            <div className={styles.photosEmpty}>
              <p className={styles.overlayTitle}>Fotos reais em breve</p>
              <p>As fotografias desta suíte serão enviadas pelo motel no Gerenciador de Suítes 3D.</p>
            </div>
          ) : (
            <div className={styles.photoGrid}>
              {info.photos.map((src, i) => (
                // eslint-disable-next-line @next/next/no-img-element
                <img key={src} src={src} alt={`Foto ${i + 1} da ${info.name}`} loading="lazy" />
              ))}
            </div>
          )}
        </div>
      )}

      {/* ---------- barra superior ---------- */}
      <header className={styles.topbar}>
        <div className={styles.brand}>
          <span className={styles.eyebrow}>{badge ?? "Tour virtual 3D"}</span>
          <h1>{info.name}</h1>
        </div>
        <div className={styles.topActions}>
          <div className={styles.segmented} role="tablist" aria-label="Modo de visualização">
            <button type="button" role="tab" aria-selected={view === "3d"} onClick={() => setView("3d")}>
              3D
            </button>
            <button type="button" role="tab" aria-selected={view === "fotos"} onClick={() => setView("fotos")}>
              Fotos
            </button>
          </div>
          {canFullscreen && (
            <button type="button" className={styles.iconBtn} onClick={toggleFullscreen} aria-label="Tela cheia">
              <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round">
                <path d="M4 9V4h5M20 9V4h-5M4 15v5h5M20 15v5h-5" />
              </svg>
            </button>
          )}
        </div>
      </header>

      {view === "3d" && status === "ready" && (
        <>
          {/* cenas de luz */}
          <div className={styles.scenes} role="group" aria-label="Clima de iluminação">
            {LIGHT_SCENES.map((s) => (
              <button
                key={s.id}
                type="button"
                aria-pressed={lightScene === s.id}
                onClick={() => changeLight(s.id)}
              >
                <span className={styles.sceneDot} style={{ background: s.dot }} />
                {s.label}
              </button>
            ))}
          </div>

          {/* zoom */}
          <div className={styles.zoom}>
            <button type="button" aria-label="Aproximar" onClick={() => engineRef.current?.zoomBy(0.7)}>+</button>
            <button type="button" aria-label="Afastar" onClick={() => engineRef.current?.zoomBy(1.4)}>−</button>
          </div>

          {/* angulos prontos */}
          <nav className={styles.presets} aria-label="Ângulos da suíte">
            {presets.map((p) => (
              <button key={p.id} type="button" aria-pressed={preset === p.id} onClick={() => goTo(p.id)}>
                {p.label}
              </button>
            ))}
          </nav>

          {hint && (
            <p className={styles.hint}>
              Arraste para girar · Role ou use dois dedos para aproximar · Toque nos pontos dourados
            </p>
          )}

          {current && (
            <div className={styles.card} role="dialog" aria-label={current.title}>
              <button type="button" className={styles.cardClose} onClick={() => setActiveHotspot(null)} aria-label="Fechar">
                ×
              </button>
              <p className={styles.cardTitle}>{current.title}</p>
              <p>{current.text}</p>
            </div>
          )}
        </>
      )}

      {/* ---------- painel de informacoes ---------- */}
      <button type="button" className={styles.mobileBar} onClick={() => setPanelOpen(true)}>
        <span>
          {lowestPrice ? (
            <>
              <small>{lowestPrice.label}</small> <strong>{lowestPrice.value}</strong>
            </>
          ) : (
            info.type
          )}
        </span>
        <span className={styles.mobileBarCta}>Detalhes e reserva</span>
      </button>

      <aside className={`${styles.panel} ${panelOpen ? styles.panelOpen : ""}`} aria-label="Informações da suíte">
        <button type="button" className={styles.panelClose} onClick={() => setPanelOpen(false)} aria-label="Fechar detalhes">
          ×
        </button>
        <p className={styles.eyebrow}>{info.type}</p>
        <h2 className={styles.panelTitle}>{info.name}</h2>
        <p className={styles.capacity}>
          <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round">
            <circle cx="9" cy="8" r="3.2" />
            <circle cx="16.5" cy="9" r="2.6" />
            <path d="M3.5 19c.6-3 2.8-4.6 5.5-4.6s4.9 1.6 5.5 4.6M14.5 14.6c2.6-.4 5 .9 5.8 4.4" />
          </svg>
          Até {info.capacity} pessoas
        </p>
        <p className={styles.description}>{info.description}</p>

        <h3 className={styles.panelSection}>Valores</h3>
        <dl className={styles.prices}>
          {info.prices.map((p) => (
            <div key={p.label}>
              <dt>{p.label}</dt>
              <dd>{p.value}</dd>
            </div>
          ))}
        </dl>

        <h3 className={styles.panelSection}>Comodidades</h3>
        <ul className={styles.amenities}>
          {info.amenities.map((a) => (
            <li key={a}>{a}</li>
          ))}
        </ul>

        <button type="button" className={styles.goldBtn} onClick={reserve}>
          Reservar esta suíte
        </button>
        {notice && (
          <p className={styles.notice} role="status">
            {notice}
          </p>
        )}
      </aside>
    </div>
  );
}
