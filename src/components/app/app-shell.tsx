"use client";

import { motelInitials } from "@/lib/initials";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { signOut } from "@/app/auth-actions";
import { BRAND } from "@/lib/brand";

type Role = "dono" | "recepcao" | "camareira";
const ROLE_LABEL: Record<Role, string> = { dono: "Proprietário", recepcao: "Recepção", camareira: "Camareira" };

export type NavItem = { href: string; label: string; icon: IconName; exact?: boolean };
type MotelRef = { id: string; name: string; role: Role };

export function AppShell({
  motel,
  motels,
  email,
  nav,
  children,
}: {
  motel: MotelRef;
  motels: MotelRef[];
  email: string;
  nav: NavItem[];
  children: React.ReactNode;
}) {
  const pathname = usePathname();
  const [drawer, setDrawer] = useState(false);
  const [openMenu, setOpenMenu] = useState<"motels" | "bell" | "profile" | null>(null);
  const headerRef = useRef<HTMLDivElement>(null);

  // fecha o menu lateral (celular) ao navegar
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

  const toggle = (m: "motels" | "bell" | "profile") => setOpenMenu((cur) => (cur === m ? null : m));
  const isActive = (item: NavItem) =>
    item.exact ? pathname === item.href : pathname === item.href || pathname.startsWith(item.href + "/");

  return (
    <div className={`app ${drawer ? "drawer-open" : ""}`}>
      {/* ---------- menu lateral ---------- */}
      <aside className="sidebar" aria-label="Menu do estabelecimento">
        <Link href="/painel?lista=1" className="sidebar-brand" aria-label="Meus estabelecimentos">
          <BrandMark />
          <span>
            {BRAND.first}
            <em>{BRAND.second}</em>
          </span>
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
        <Link href="/painel?lista=1" className="sidebar-all">
          <Icon name="grid" /> Meus estabelecimentos
        </Link>
      </aside>
      <button type="button" className="drawer-backdrop" aria-label="Fechar menu" onClick={() => setDrawer(false)} />

      <div className="app-main">
        {/* ---------- cabecalho ---------- */}
        <div className="app-header" ref={headerRef}>
          <button type="button" className="icon-btn menu-btn" aria-label="Abrir menu" onClick={() => setDrawer(true)}>
            <Icon name="menu" />
          </button>

          <div className="motel-switch">
            <button
              type="button"
              className="motel-switch-btn"
              aria-haspopup="listbox"
              aria-expanded={openMenu === "motels"}
              onClick={() => toggle("motels")}
            >
              <span className="motel-avatar" aria-hidden="true">
                {motelInitials(motel.name)}
              </span>
              <span className="motel-switch-text">
                <strong>{motel.name}</strong>
                <small>{ROLE_LABEL[motel.role]}</small>
              </span>
              <Icon name="chevron" />
            </button>
            {openMenu === "motels" && (
              <div className="popover motels-popover" role="listbox" aria-label="Trocar de estabelecimento">
                <p className="popover-title">Trocar de estabelecimento</p>
                <ul>
                  {motels.map((m) => (
                    <li key={m.id}>
                      <Link
                        href={`/painel/${m.id}`}
                        role="option"
                        aria-selected={m.id === motel.id}
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
              </div>
            )}
          </div>

          <div className="header-actions">
            <div className="popover-anchor">
              <button
                type="button"
                className="icon-btn"
                aria-label="Notificações"
                aria-expanded={openMenu === "bell"}
                onClick={() => toggle("bell")}
              >
                <Icon name="bell" />
              </button>
              {openMenu === "bell" && (
                <div className="popover bell-popover" role="dialog" aria-label="Notificações">
                  <p className="popover-title">Notificações</p>
                  <p className="popover-empty">Nenhuma notificação por enquanto.</p>
                </div>
              )}
            </div>
            <div className="popover-anchor">
              <button
                type="button"
                className="profile-btn"
                aria-label="Perfil"
                aria-expanded={openMenu === "profile"}
                onClick={() => toggle("profile")}
              >
                <span className="profile-avatar">{(email[0] ?? "?").toUpperCase()}</span>
              </button>
              {openMenu === "profile" && (
                <div className="popover profile-popover" role="dialog" aria-label="Perfil">
                  <p className="popover-title">Conectado como</p>
                  <p className="profile-email">{email}</p>
                  <Link href="/painel?lista=1" className="popover-link">
                    Meus estabelecimentos
                  </Link>
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

type IconName =
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
  | "bell";

const PATHS: Record<IconName, React.ReactNode> = {
  dashboard: <><rect x="3" y="3" width="7" height="9" rx="1.5" /><rect x="14" y="3" width="7" height="5" rx="1.5" /><rect x="14" y="12" width="7" height="9" rx="1.5" /><rect x="3" y="16" width="7" height="5" rx="1.5" /></>,
  suites: <><path d="M3 18v-6a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2v6M3 18h18M3 21v-3M21 21v-3" /><path d="M6 10V7a2 2 0 0 1 2-2h8a2 2 0 0 1 2 2v3" /></>,
  reservas: <><rect x="3" y="5" width="18" height="16" rx="2" /><path d="M3 10h18M8 3v4M16 3v4M8 14h3" /></>,
  clientes: <><circle cx="9" cy="8" r="3.2" /><path d="M3.5 19c.6-3 2.8-4.6 5.5-4.6s4.9 1.6 5.5 4.6" /><circle cx="17" cy="9" r="2.5" /><path d="M15.5 14.6c2.6-.3 4.6 1.1 5.2 4.4" /></>,
  equipe: <><circle cx="12" cy="7.5" r="3.5" /><path d="M5 20c.8-3.8 3.6-6 7-6s6.2 2.2 7 6" /></>,
  promocoes: <><path d="M20.6 13.4 13.4 20.6a2 2 0 0 1-2.8 0L3 13V3h10l7.6 7.6a2 2 0 0 1 0 2.8Z" /><circle cx="7.5" cy="7.5" r="1.3" /></>,
  relatorios: <><path d="M4 20V10M10 20V4M16 20v-7M22 20H2" /></>,
  configuracoes: <><circle cx="12" cy="12" r="3" /><path d="M19.4 15a1.7 1.7 0 0 0 .3 1.8l.1.1a2 2 0 1 1-2.8 2.8l-.1-.1a1.7 1.7 0 0 0-1.8-.3 1.7 1.7 0 0 0-1 1.5V21a2 2 0 1 1-4 0v-.1a1.7 1.7 0 0 0-1.1-1.5 1.7 1.7 0 0 0-1.8.3l-.1.1a2 2 0 1 1-2.8-2.8l.1-.1a1.7 1.7 0 0 0 .3-1.8 1.7 1.7 0 0 0-1.5-1H3a2 2 0 1 1 0-4h.1a1.7 1.7 0 0 0 1.5-1.1 1.7 1.7 0 0 0-.3-1.8l-.1-.1a2 2 0 1 1 2.8-2.8l.1.1a1.7 1.7 0 0 0 1.8.3H9a1.7 1.7 0 0 0 1-1.5V3a2 2 0 1 1 4 0v.1a1.7 1.7 0 0 0 1 1.5 1.7 1.7 0 0 0 1.8-.3l.1-.1a2 2 0 1 1 2.8 2.8l-.1.1a1.7 1.7 0 0 0-.3 1.8V9a1.7 1.7 0 0 0 1.5 1H21a2 2 0 1 1 0 4h-.1a1.7 1.7 0 0 0-1.5 1Z" /></>,
  motel: <><path d="M3 21h18M5 21V7l7-4 7 4v14" /><path d="M9 21v-5h6v5M9 10h.01M15 10h.01" /></>,
  grid: <><rect x="3" y="3" width="7" height="7" rx="1.5" /><rect x="14" y="3" width="7" height="7" rx="1.5" /><rect x="3" y="14" width="7" height="7" rx="1.5" /><rect x="14" y="14" width="7" height="7" rx="1.5" /></>,
  menu: <path d="M4 7h16M4 12h16M4 17h16" />,
  chevron: <path d="m6 9 6 6 6-6" />,
  check: <path d="m5 12 5 5 9-10" />,
  bell: <><path d="M6 8a6 6 0 0 1 12 0c0 7 3 8 3 8H3s3-1 3-8" /><path d="M10.3 21a1.9 1.9 0 0 0 3.4 0" /></>,
};

export function Icon({ name }: { name: IconName }) {
  return (
    <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      {PATHS[name]}
    </svg>
  );
}
