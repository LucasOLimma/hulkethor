// Titulo padrao das paginas internas do painel do motel.
export function PageHeader({
  title,
  subtitle,
  actions,
}: {
  title: string;
  subtitle?: string;
  actions?: React.ReactNode;
}) {
  return (
    <header className="page-header">
      <div>
        <h1>{title}</h1>
        {subtitle && <p>{subtitle}</p>}
      </div>
      {actions && <div className="page-header-actions">{actions}</div>}
    </header>
  );
}

// Para areas que ainda nao existem no sistema: diz isso com clareza,
// sem numeros ou listas inventadas.
export function ComingSoon({ title, text }: { title: string; text: string }) {
  return (
    <div className="content-card coming-soon">
      <span className="coming-soon-badge">Em desenvolvimento</span>
      <h2>{title}</h2>
      <p>{text}</p>
    </div>
  );
}
