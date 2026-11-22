"use client";

import { motelInitials } from "@/lib/initials";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { signOut } from "@/app/auth-actions";

type Role = "dono" | "recepcao" | "camareira";
const ROLE_LABEL: Record<Role, string> = { dono: "Proprietário", recepcao: "Recepção", camareira: "Camareira" };

export type NavItem = { href: string; label: string; icon: IconName; exact?: boolean };
/** Aviso do sininho. So dados reais (ex.: alertas do estoque). */
export type Notice = { id: string; title: string; text: string; href: string; tone?: "warn" | "bad" };
type MotelRef = { id: string; name: string; role: Role };

export function AppShell({
  motel,
  motels,
  email,
  nav,
  notices = [],
  children,
}: {
  motel: MotelRef;
  motels: MotelRef[];
  email: string;
  nav: NavItem[];
  notices?: Notice[];
  children: React.ReactNode;
}) {
  const pathname = usePathname();
  const [drawer, setDrawer] = useState(false);
  const [openMenu, setOpenMenu] = useState<"motels" | "bell" | null>(null);
  const headerRef = useRef<HTMLDivElement>(null);

  // fecha o menu lateral (celular) e os menus ao navegar
  const [lastPath, setLastPath] = useState(pathname);
  if (lastPath !== pathname) {
    setLastPath(pathname);
    setDrawer(false);
    setOpenMenu(null);
  }

  // fecha menus ao clicar fora ou apertar Esc
  useEffect(() => {
    const onDown = (e: MouseEvent) => {
      if (headerRef.current && !headerRef.current.contains(e.target as Node)) setOpenMenu(null);
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        setOpenMenu(null);
        setDrawer(false);
      }
    };
    document.addEventListener("mousedown", onDown);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onDown);
      document.removeEventListener("keydown", onKey);
    };
  }, []);

  const toggle = (m: "motels" | "bell") => setOpenMenu((cur) => (cur === m ? null : m));
  const isActive = (item: NavItem) =>
    item.exact ? pathname === item.href : pathname === item.href || pathname.startsWith(item.href + "/");

  // "Motel Premium" -> "Motel" + "Premium" (segunda parte em dourado)
  const [nameFirst, ...nameRest] = motel.name.split(" ");

  return (
    <div className={`app ${drawer ? "drawer-open" : ""}`}>
      {/* ---------- menu lateral ---------- */}
      <aside className="sidebar" aria-label="Menu do estabelecimento">
        <Link href={`/painel/${motel.id}`} className="sidebar-brand" aria-label={`Dashboard de ${motel.name}`}>
          <MotelMonogram initials={motelInitials(motel.name)} />
          <span className="sidebar-brand-name">
            {nameFirst}
            {nameRest.length > 0 && <em> {nameRest.join(" ")}</em>}
          </span>
          <small>Painel Administrativo</small>
        </Link>
        <nav>
          <ul>
            {nav.map((item) => (
              <li key={item.href}>
                <Link
                  href={item.href}
                  className={isActive(item) ? "active" : undefined}
                  aria-current={isActive(item) ? "page" : undefined}
                >
                  <Icon name={item.icon} />
                  {item.label}
                </Link>
              </li>
            ))}
          </ul>
        </nav>

        <div className="sidebar-promo">
          <Icon name="cube" />
          <p>Conheça o tour 3D de suítes</p>
          <Link href="/demo/suite-3d" className="sidebar-promo-btn">
            Ver demonstração →
          </Link>
        </div>
        <Link href="/painel?lista=1" className="sidebar-all">
          <Icon name="grid" /> Meus estabelecimentos
        </Link>
        <p className="sidebar-version">Versão 0.1.0</p>
      </aside>
      <button type="button" className="drawer-backdrop" aria-label="Fechar menu" onClick={() => setDrawer(false)} />

      <div className="app-main">
        {/* ---------- cabecalho ---------- */}
        <div className="app-header" ref={headerRef}>
          <button type="button" className="icon-btn menu-btn" aria-label="Abrir menu" onClick={() => setDrawer(true)}>
            <Icon name="menu" />
          </button>
          <div className="header-greeting">
            <strong>Olá, {ROLE_LABEL[motel.role]}!</strong>
            <span>Gerencie seu motel de forma simples e eficiente</span>
          </div>

          <div className="header-actions">
            <div className="popover-anchor">
              <button
                type="button"
                className="icon-btn bare"
                aria-label={notices.length ? `Notificações (${notices.length})` : "Notificações"}
                aria-expanded={openMenu === "bell"}
                onClick={() => toggle("bell")}
              >
                <Icon name="bell" />
                {notices.length > 0 && <span className="bell-count">{notices.length > 9 ? "9+" : notices.length}</span>}
              </button>
              {openMenu === "bell" && (
                <div className="popover bell-popover" role="dialog" aria-label="Notificações">
                  <p className="popover-title">Notificações</p>
                  {notices.length === 0 ? (
                    <p className="popover-empty">Nenhuma notificação por enquanto.</p>
                  ) : (
                    <ul className="notice-list">
                      {notices.slice(0, 8).map((n) => (
                        <li key={n.id}>
                          <Link href={n.href} className={`notice ${n.tone ?? "warn"}`}>
                            <strong>{n.title}</strong>
                            <span>{n.text}</span>
                          </Link>
                        </li>
                      ))}
                      {notices.length > 8 && <li className="popover-empty">e mais {notices.length - 8}…</li>}
                    </ul>
                  )}
                </div>
              )}
            </div>

            <div className="popover-anchor motel-switch">
              <button
                type="button"
                className="motel-switch-btn"
                aria-haspopup="menu"
                aria-expanded={openMenu === "motels"}
                onClick={() => toggle("motels")}
              >
                <span className="motel-avatar" aria-hidden="true">
                  {motelInitials(motel.name)}
                </span>
                <span className="motel-switch-text">
                  <strong>{motel.name}</strong>
                </span>
                <Icon name="chevron" />
              </button>
              {openMenu === "motels" && (
                <div className="popover motels-popover" role="menu" aria-label="Estabelecimento e perfil">
                  <p className="popover-title">Trocar de estabelecimento</p>
                  <ul>
                    {motels.map((m) => (
                      <li key={m.id}>
                        <Link
                          href={`/painel/${m.id}`}
                          role="menuitem"
                          aria-current={m.id === motel.id ? "true" : undefined}
                          className={m.id === motel.id ? "current" : undefined}
                        >
                          <span className="motel-avatar small" aria-hidden="true">
                            {motelInitials(m.name)}
                          </span>
                          <span>
                            <strong>{m.name}</strong>
                            <small>{ROLE_LABEL[m.role]}</small>
                          </span>
                          {m.id === motel.id && <Icon name="check" />}
                        </Link>
                      </li>
                    ))}
                  </ul>
                  <Link href="/painel?lista=1" className="popover-footer">
                    Ver todos os estabelecimentos
                  </Link>
                  <p className="popover-title spaced">Conectado como</p>
                  <p className="profile-email">{email}</p>
                  <form action={signOut}>
                    <button type="submit" className="popover-link danger">
                      Sair
                    </button>
                  </form>
                </div>
              )}
            </div>
          </div>
        </div>

        <main className="app-body">{children}</main>
      </div>
    </div>
  );
}

/** Monograma do estabelecimento (enquanto nao ha logotipo cadastrado). */
function MotelMonogram({ initials }: { initials: string }) {
  return (
    <span className="motel-monogram" aria-hidden="true">
      <svg viewBox="0 0 64 40" width="64" height="40" fill="none">
        <path d="M6 34 14 8l18 18L50 8l8 26" stroke="url(#mg)" strokeWidth="2.4" strokeLinejoin="round" />
        <path d="M6 34h52" stroke="url(#mg)" strokeWidth="2.4" strokeLinecap="round" />
        <defs>
          <linearGradient id="mg" x1="0" y1="0" x2="1" y2="1">
            <stop offset="0" stopColor="#f3d9a4" />
            <stop offset="1" stopColor="#b8873c" />
          </linearGradient>
        </defs>
      </svg>
      <span>{initials}</span>
    </span>
  );
}

export function BrandMark({ size = 26 }: { size?: number }) {
  return (
    <svg viewBox="0 0 64 56" width={size} height={(size * 56) / 64} fill="none" aria-hidden="true">
      <path
        d="M32 52S6 37 6 19.5C6 11 12.5 5 20 5c5.2 0 9.4 2.9 12 7 2.6-4.1 6.8-7 12-7 7.5 0 14 6 14 14.5C58 37 32 52 32 52Z"
        stroke="#d4a85a"
        strokeWidth="3.4"
        strokeLinejoin="round"
      />
      <circle cx="32" cy="24" r="4.6" fill="#d4a85a" />
      <path d="M29.8 27.5h4.4l1.6 9.5h-7.6l1.6-9.5Z" fill="#d4a85a" />
    </svg>
  );
}

export type IconName =
  | "dashboard"
  | "suites"
  | "reservas"
  | "clientes"
  | "equipe"
  | "promocoes"
  | "relatorios"
  | "configuracoes"
  | "motel"
  | "grid"
  | "menu"
  | "chevron"
  | "check"
  | "bell"
  | "cube"
  | "trend"
  | "door"
  | "percent"
  | "users"
  | "estoque";

const PATHS: Record<IconName, React.ReactNode> = {
  dashboard: <><path d="M3 11.5 12 4l9 7.5" /><path d="M5.5 9.5V20h13V9.5" /><path d="M10 20v-5h4v5" /></>,
  suites: <><path d="M3 18v-6a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2v6M3 18h18M3 21v-3M21 21v-3" /><path d="M6 10V7a2 2 0 0 1 2-2h8a2 2 0 0 1 2 2v3" /></>,
  reservas: <><rect x="3" y="5" width="18" height="16" rx="2" /><path d="M3 10h18M8 3v4M16 3v4M8 14h2M14 14h2M8 17h2" /></>,
  clientes: <><circle cx="9" cy="8" r="3.2" /><path d="M3.5 19c.6-3 2.8-4.6 5.5-4.6s4.9 1.6 5.5 4.6" /><circle cx="17" cy="9" r="2.5" /><path d="M15.5 14.6c2.6-.3 4.6 1.1 5.2 4.4" /></>,
  users: <><circle cx="9" cy="8" r="3.2" /><path d="M3.5 19c.6-3 2.8-4.6 5.5-4.6s4.9 1.6 5.5 4.6" /><circle cx="17" cy="9" r="2.5" /><path d="M15.5 14.6c2.6-.3 4.6 1.1 5.2 4.4" /></>,
  equipe: <><circle cx="12" cy="7.5" r="3.5" /><path d="M5 20c.8-3.8 3.6-6 7-6s6.2 2.2 7 6" /></>,
  promocoes: <><path d="M12 3 21 12l-9 9-9-9 9-9Z" /><circle cx="12" cy="9" r="1.2" /></>,
  relatorios: <><rect x="4" y="4" width="16" height="16" rx="2" /><path d="M8 16v-4M12 16V8M16 16v-6" /></>,
  configuracoes: <><circle cx="12" cy="12" r="3" /><path d="M19.4 15a1.7 1.7 0 0 0 .3 1.8l.1.1a2 2 0 1 1-2.8 2.8l-.1-.1a1.7 1.7 0 0 0-1.8-.3 1.7 1.7 0 0 0-1 1.5V21a2 2 0 1 1-4 0v-.1a1.7 1.7 0 0 0-1.1-1.5 1.7 1.7 0 0 0-1.8.3l-.1.1a2 2 0 1 1-2.8-2.8l.1-.1a1.7 1.7 0 0 0 .3-1.8 1.7 1.7 0 0 0-1.5-1H3a2 2 0 1 1 0-4h.1a1.7 1.7 0 0 0 1.5-1.1 1.7 1.7 0 0 0-.3-1.8l-.1-.1a2 2 0 1 1 2.8-2.8l.1.1a1.7 1.7 0 0 0 1.8.3H9a1.7 1.7 0 0 0 1-1.5V3a2 2 0 1 1 4 0v.1a1.7 1.7 0 0 0 1 1.5 1.7 1.7 0 0 0 1.8-.3l.1-.1a2 2 0 1 1 2.8 2.8l-.1.1a1.7 1.7 0 0 0-.3 1.8V9a1.7 1.7 0 0 0 1.5 1H21a2 2 0 1 1 0 4h-.1a1.7 1.7 0 0 0-1.5 1Z" /></>,
  motel: <><circle cx="12" cy="7.5" r="3.5" /><path d="M5 20c.8-3.8 3.6-6 7-6s6.2 2.2 7 6" /><path d="M17 4.5l1.5-1.5M19 7h2" /></>,
  grid: <><rect x="3" y="3" width="7" height="7" rx="1.5" /><rect x="14" y="3" width="7" height="7" rx="1.5" /><rect x="3" y="14" width="7" height="7" rx="1.5" /><rect x="14" y="14" width="7" height="7" rx="1.5" /></>,
  menu: <path d="M4 7h16M4 12h16M4 17h16" />,
  chevron: <path d="m6 9 6 6 6-6" />,
  check: <path d="m5 12 5 5 9-10" />,
  bell: <><path d="M6 8a6 6 0 0 1 12 0c0 7 3 8 3 8H3s3-1 3-8" /><path d="M10.3 21a1.9 1.9 0 0 0 3.4 0" /></>,
  cube: <><path d="M12 3 20 7.5v9L12 21l-8-4.5v-9L12 3Z" /><path d="M4 7.5 12 12l8-4.5M12 12v9" /></>,
  trend: <><path d="M3 17 9 11l4 4 8-8" /><path d="M15 7h6v6" /></>,
  door: <><path d="M5 21V4a1 1 0 0 1 1-1h12a1 1 0 0 1 1 1v17M3 21h18" /><path d="M15 12h.01" /></>,
  estoque: <><path d="M3 8.5 12 4l9 4.5v8L12 21l-9-4.5v-8Z" /><path d="M3 8.5 12 13l9-4.5M12 13v8M7.5 6.3l9 4.5" /></>,
  percent: <><path d="M19 5 5 19" /><circle cx="7" cy="7" r="2.5" /><circle cx="17" cy="17" r="2.5" /></>,
};

export function Icon({ name, size = 18 }: { name: IconName; size?: number }) {
  return (
    <svg viewBox="0 0 24 24" width={size} height={size} fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      {PATHS[name]}
    </svg>
  );
}
