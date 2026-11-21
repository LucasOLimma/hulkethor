// Moldura visual das telas de acesso (login, recuperar senha, nova senha).
// Lado esquerdo: painel da marca. Lado direito: o conteudo (formulario).

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
      <aside className="auth-brand" aria-hidden="true">
        <div className="auth-brand-glow" />
        <div className="auth-brand-top">
          <span className="logo-mark">
            <KeyIcon />
          </span>
          <span className="logo-text">Painel do Motel</span>
        </div>
        <div className="auth-brand-body">
          <p className="eyebrow">Área da equipe</p>
          <h2>
            Tudo do seu motel,
            <br />
            em um só lugar.
          </h2>
          <p className="brand-copy">
            Acesso exclusivo para donos, recepção e camareiras. Cada motel vê apenas os próprios
            dados.
          </p>
        </div>
        <p className="auth-brand-foot">
          <LockIcon /> Conexão protegida
        </p>
      </aside>

      <section className="auth-main">
        <div className="auth-panel">
          <div className="auth-mobile-logo">
            <span className="logo-mark small">
              <KeyIcon />
            </span>
            <span className="logo-text">Painel do Motel</span>
          </div>
          <h1>{title}</h1>
          {subtitle && <p className="subtitle">{subtitle}</p>}
          {children}
        </div>
      </section>
    </main>
  );
}

export function KeyIcon() {
  return (
    <svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
      <circle cx="7.5" cy="15.5" r="4.5" />
      <path d="M10.7 12.3 20 3M16 7l3 3M14 9l2 2" />
    </svg>
  );
}

export function LockIcon() {
  return (
    <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
      <rect x="4" y="11" width="16" height="10" rx="2" />
      <path d="M8 11V7a4 4 0 0 1 8 0v4" />
    </svg>
  );
}

export function MailIcon() {
  return (
    <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
      <rect x="3" y="5" width="18" height="14" rx="2" />
      <path d="m3 7 9 6 9-6" />
    </svg>
  );
}

export function AlertIcon() {
  return (
    <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
      <circle cx="12" cy="12" r="9" />
      <path d="M12 8v5M12 16h.01" />
    </svg>
  );
}

export function CheckIcon() {
  return (
    <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
      <circle cx="12" cy="12" r="9" />
      <path d="m8 12 3 3 5-6" />
    </svg>
  );
}
