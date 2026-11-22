import { LoginPhoto } from "./login-photo";

// Moldura das telas de acesso (login, recuperar senha, nova senha).
// Esquerda (~65%): FOTOGRAFIA real de uma suite + texto.
// Direita: painel de login grafite.
//
// A foto fica em public/login/suite.jpg. Para trocar, basta substituir
// esse arquivo (de preferencia 2400px de largura, horizontal, JPG).
// Sem a foto, a tela continua bonita com um fundo escuro neutro.
export const LOGIN_PHOTO = "/login/suite.jpg";

export function AuthShell({
  title,
  subtitle,
  children,
}: {
  title: string;
  subtitle?: string;
  children: React.ReactNode;
}) {
  return (
    <main className="auth">
      <section className="auth-photo" aria-hidden="true">
        <LoginPhoto src={LOGIN_PHOTO} />
        <div className="auth-photo-shade" />
        <div className="auth-photo-content">
          <Logo />
          <div className="auth-photo-text">
            <h2>Sua experiência começa aqui</h2>
            <p>Gestão de suítes, equipe e reservas para motéis de alto padrão.</p>
          </div>
          <ul className="auth-perks">
            <li>
              <LockIcon /> Acesso seguro
            </li>
            <li>
              <ShieldIcon /> Dados de cada motel isolados
            </li>
            <li>
              <KeyIcon /> Acesso por convite
            </li>
          </ul>
        </div>
      </section>

      <section className="auth-main">
        <div className="auth-panel">
          <div className="auth-mobile-logo">
            <Logo />
          </div>
          <h1>{title}</h1>
          {subtitle && <p className="subtitle">{subtitle}</p>}
          {children}
        </div>
      </section>
    </main>
  );
}

function Logo() {
  return (
    <span className="logo">
      <span className="logo-mark">M</span>
      <span className="logo-text">
        Painel do Motel
        <small>Hospitalidade premium</small>
      </span>
    </span>
  );
}

const iconProps = {
  viewBox: "0 0 24 24",
  fill: "none",
  stroke: "currentColor",
  strokeWidth: 1.5,
  strokeLinecap: "round" as const,
  strokeLinejoin: "round" as const,
};

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
    <svg {...iconProps} width="16" height="16">
      <rect x="4" y="11" width="16" height="10" rx="2" />
      <path d="M8 11V7a4 4 0 0 1 8 0v4" />
    </svg>
  );
}

function ShieldIcon() {
  return (
    <svg {...iconProps} width="16" height="16">
      <path d="M12 3 5 6v5c0 4.5 3 8.5 7 10 4-1.5 7-5.5 7-10V6l-7-3Z" />
    </svg>
  );
}

export function MailIcon() {
  return (
    <svg {...iconProps} width="18" height="18">
      <rect x="3" y="5" width="18" height="14" rx="2" />
      <path d="m3 7 9 6 9-6" />
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
