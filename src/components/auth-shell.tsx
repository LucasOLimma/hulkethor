import { BRAND } from "@/lib/brand";
import { LoginPhoto } from "./login-photo";

// Moldura das telas de acesso (login, recuperar senha, nova senha).
// Fundo: FOTOGRAFIA real de uma suite ocupando a tela inteira.
// Direita: cartao escuro com o logotipo e o formulario.
// Rodape a esquerda: diferenciais.
//
// A foto fica em public/login/suite.jpg (horizontal, ~2400px, JPG).
// Sem a foto, a tela continua bonita com um fundo escuro quente.
export const LOGIN_PHOTO = "/login/suite.jpg";

export function AuthShell({
  title,
  subtitle,
  children,
}: {
  title: React.ReactNode;
  subtitle?: string;
  children: React.ReactNode;
}) {
  return (
    <main className="auth">
      <div className="auth-photo" aria-hidden="true">
        <LoginPhoto src={LOGIN_PHOTO} />
        <div className="auth-photo-shade" />
      </div>

      <ul className="auth-perks" aria-label="Diferenciais">
        <li>
          <CrownIcon />
          <strong>Suítes exclusivas</strong>
          <span>Conforto em cada detalhe</span>
        </li>
        <li>
          <HeartIcon />
          <strong>Momentos inesquecíveis</strong>
          <span>Feitos para dois</span>
        </li>
        <li>
          <ShieldIcon />
          <strong>Discrição total</strong>
          <span>Sua privacidade em primeiro lugar</span>
        </li>
      </ul>

      <section className="auth-card">
        <Logo />
        <h1 className="auth-title">{title}</h1>
        {subtitle && <p className="subtitle">{subtitle}</p>}
        {children}
      </section>
    </main>
  );
}

function Logo() {
  return (
    <div className="logo">
      <LogoMark />
      <p className="logo-name">
        {BRAND.first}
        <span>{BRAND.second}</span>
      </p>
      <p className="logo-tagline">{BRAND.tagline}</p>
    </div>
  );
}

// Coracao com fechadura: discreto, sensual e ligado a "chave da suite".
function LogoMark() {
  return (
    <svg className="logo-mark" viewBox="0 0 64 56" width="64" height="56" fill="none" aria-hidden="true">
      <defs>
        <linearGradient id="gold" x1="0" y1="0" x2="1" y2="1">
          <stop offset="0" stopColor="#f3d9a4" />
          <stop offset="0.55" stopColor="#d4a85a" />
          <stop offset="1" stopColor="#a8782f" />
        </linearGradient>
      </defs>
      <path
        d="M32 52S6 37 6 19.5C6 11 12.5 5 20 5c5.2 0 9.4 2.9 12 7 2.6-4.1 6.8-7 12-7 7.5 0 14 6 14 14.5C58 37 32 52 32 52Z"
        stroke="url(#gold)"
        strokeWidth="3"
        strokeLinejoin="round"
      />
      <circle cx="32" cy="24" r="4.6" fill="url(#gold)" />
      <path d="M29.8 27.5h4.4l1.6 9.5h-7.6l1.6-9.5Z" fill="url(#gold)" />
    </svg>
  );
}

const iconProps = {
  viewBox: "0 0 24 24",
  fill: "none",
  stroke: "currentColor",
  strokeWidth: 1.4,
  strokeLinecap: "round" as const,
  strokeLinejoin: "round" as const,
};

function CrownIcon() {
  return (
    <svg {...iconProps} width="30" height="30">
      <path d="M3 8l4.5 4L12 5l4.5 7L21 8l-2 10H5L3 8Z" />
      <path d="M5 21h14" />
    </svg>
  );
}

function HeartIcon() {
  return (
    <svg {...iconProps} width="30" height="30">
      <path d="M12 20s-7.5-4.6-7.5-10A4.3 4.3 0 0 1 12 7.4 4.3 4.3 0 0 1 19.5 10C19.5 15.4 12 20 12 20Z" />
    </svg>
  );
}

function ShieldIcon() {
  return (
    <svg {...iconProps} width="30" height="30">
      <path d="M12 3 5 6v5c0 4.5 3 8.5 7 10 4-1.5 7-5.5 7-10V6l-7-3Z" />
      <path d="m9 12 2 2 4-4" />
    </svg>
  );
}

export function KeyIcon() {
  return (
    <svg {...iconProps} width="16" height="16">
      <circle cx="7.5" cy="15.5" r="4.5" />
      <path d="M10.7 12.3 20 3M16 7l3 3M14 9l2 2" />
    </svg>
  );
}

export function LockIcon() {
  return (
    <svg {...iconProps} width="20" height="20">
      <rect x="4" y="11" width="16" height="10" rx="2" />
      <path d="M8 11V7a4 4 0 0 1 8 0v4" />
    </svg>
  );
}

export function MailIcon() {
  return (
    <svg {...iconProps} width="20" height="20">
      <rect x="3" y="5" width="18" height="14" rx="2" />
      <path d="m3 7 9 6 9-6" />
    </svg>
  );
}

export function EnterIcon() {
  return (
    <svg {...iconProps} width="20" height="20" strokeWidth={1.8}>
      <path d="M14 4h4a2 2 0 0 1 2 2v12a2 2 0 0 1-2 2h-4" />
      <path d="M10 16l4-4-4-4M14 12H4" />
    </svg>
  );
}

export function AlertIcon() {
  return (
    <svg {...iconProps} width="18" height="18">
      <circle cx="12" cy="12" r="9" />
      <path d="M12 8v5M12 16h.01" />
    </svg>
  );
}

export function CheckIcon() {
  return (
    <svg {...iconProps} width="18" height="18">
      <circle cx="12" cy="12" r="9" />
      <path d="m8 12 3 3 5-6" />
    </svg>
  );
}
