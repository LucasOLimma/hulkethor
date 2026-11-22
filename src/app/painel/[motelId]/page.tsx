import Link from "next/link";
import { notFound } from "next/navigation";
import { requireMotel } from "@/lib/motel-access";
import { loadDashboard, parsePeriod, PERIOD_OPTIONS, STATUS_LABEL, type SuiteOpStatus } from "@/lib/dashboard-data";
import { formatCents, PERIOD_LABEL, type Period } from "@/lib/periods";
import { PageHeader } from "@/components/app/page-header";
import { TimeChart } from "@/components/app/charts";

export const dynamic = "force-dynamic";

const OP_LABEL: Record<SuiteOpStatus, string> = {
  livre: "Livre",
  ocupada: "Ocupada",
  reservada: "Reservada hoje",
  desativada: "Desativada",
};

const int = new Intl.NumberFormat("pt-BR");
const dayLabel = (iso: string) => `${iso.slice(8, 10)}/${iso.slice(5, 7)}`;

export default async function DashboardPage({
  params,
  searchParams,
}: {
  params: Promise<{ motelId: string }>;
  searchParams: Promise<{ periodo?: string }>;
}) {
  const { motelId } = await params;
  const { periodo } = await searchParams;

  // Confere no banco se a pessoa tem acesso a ESTE motel.
  const ctx = await requireMotel(motelId);
  if (!ctx) notFound();

  const days = parsePeriod(periodo);
  const d = await loadDashboard(ctx, days);
  const base = `/painel/${ctx.motel.id}`;
  const k = d.kpis;

  return (
    <>
      <PageHeader
        title="Dashboard"
        subtitle={`${ctx.motel.name} · ${dayLabel(d.from)} a ${dayLabel(d.today)}`}
        actions={
          d.canSeeReservations && (
            <nav className="segmented-links" aria-label="Período">
              {PERIOD_OPTIONS.map((p) => (
                <Link key={p} href={`${base}?periodo=${p}`} aria-current={p === days ? "page" : undefined}>
                  {p} dias
                </Link>
              ))}
            </nav>
          )
        }
      />

      {d.error && (
        <p className="alert error" role="alert">
          Parte dos dados não pôde ser carregada agora. Recarregue a página.
        </p>
      )}

      {/* ---------- indicadores ---------- */}
      <section className="kpis" aria-label="Indicadores">
        {d.canSeeReservations && (
          <>
            <Kpi label="Faturamento do período" value={formatCents(k.revenueCents)} hint="reservas válidas" accent />
            <Kpi label="Total de reservas" value={int.format(k.reservations)} hint={`últimos ${days} dias`} />
            <Kpi label="Clientes atendidos" value={int.format(k.served)} hint="chegada registrada ou concluída" />
          </>
        )}
        <Kpi label="Suítes cadastradas" value={int.format(k.suitesTotal)} hint={`${k.activeSuites} ativas`} />
        <Kpi label="Suítes disponíveis" value={int.format(k.suitesAvailable)} hint="livres agora" />
        <Kpi
          label="Taxa de ocupação"
          value={k.occupancy === null ? "—" : `${Math.round(k.occupancy * 100)}%`}
          hint={k.occupancy === null ? "sem suítes ativas" : `${k.occupiedNow} de ${k.activeSuites} ocupadas agora`}
        />
      </section>

      {/* ---------- graficos ---------- */}
      {d.canSeeReservations && (
        <section className="dash-grid two">
          <div className="content-card">
            <h2 className="card-title">Faturamento por dia</h2>
            <TimeChart
              kind="column"
              title="Faturamento"
              data={d.daily.map((x) => ({ key: x.date, label: dayLabel(x.date), value: x.revenueCents / 100 }))}
              valueType="brl"
              emptyText="Sem faturamento no período."
            />
          </div>
          <div className="content-card">
            <h2 className="card-title">Evolução das reservas</h2>
            <TimeChart
              kind="line"
              title="Reservas"
              data={d.daily.map((x) => ({ key: x.date, label: dayLabel(x.date), value: x.reservations }))}
              valueType="reservas"
              emptyText="Sem reservas no período."
            />
          </div>
        </section>
      )}

      <section className={`dash-grid ${d.canSeeReservations ? "three" : ""}`}>
        {/* ---------- situacao das suites ---------- */}
        <div className="content-card">
          <div className="card-head">
            <h2 className="card-title">Situação das suítes</h2>
            <Link href={`${base}/suites`} className="card-link">
              Gerenciar
            </Link>
          </div>
          {d.suiteStatus.length === 0 ? (
            <p className="empty small">Nenhuma suíte cadastrada.</p>
          ) : (
            <ul className="op-grid">
              {d.suiteStatus.map((s) => (
                <li key={s.id} className={`op op-${s.status}`}>
                  <strong>{s.number}</strong>
                  <span className="op-status">
                    <StatusIcon status={s.status} /> {OP_LABEL[s.status]}
                  </span>
                  <small>{s.type}</small>
                </li>
              ))}
            </ul>
          )}
        </div>

        {d.canSeeReservations && (
          <>
            {/* ---------- suites em destaque ---------- */}
            <div className="content-card">
              <h2 className="card-title">Suítes em destaque</h2>
              {d.topSuites.length === 0 ? (
                <p className="empty small">Sem reservas no período para comparar.</p>
              ) : (
                <ol className="top-list">
                  {d.topSuites.map((t, i) => (
                    <li key={t.suite!.id}>
                      <span className="top-rank">{i + 1}</span>
                      <span className="top-name">
                        <strong>Suíte {t.suite!.number}</strong>
                        <small>{t.suite!.type}</small>
                      </span>
                      <span className="top-value">
                        <strong>{int.format(t.count)}</strong>
                        <small>{formatCents(t.revenueCents)}</small>
                      </span>
                    </li>
                  ))}
                </ol>
              )}
            </div>

            {/* ---------- reservas recentes ---------- */}
            <div className="content-card">
              <div className="card-head">
                <h2 className="card-title">Reservas recentes</h2>
                <Link href={`${base}/reservas`} className="card-link">
                  Ver todas
                </Link>
              </div>
              {d.recent.length === 0 ? (
                <p className="empty small">Nenhuma reserva registrada ainda.</p>
              ) : (
                <ul className="recent-list">
                  {d.recent.map((r) => (
                    <li key={r.id}>
                      <span>
                        <strong>Suíte {r.suiteNumber}</strong>
                        <small>
                          {dayLabel(r.stay_date)} · {PERIOD_LABEL[r.period as Period] ?? r.period}
                        </small>
                      </span>
                      <span className="recent-right">
                        <strong>{formatCents(r.total_cents)}</strong>
                        <span className={`pill pill-${r.status}`}>{STATUS_LABEL[r.status] ?? r.status}</span>
                      </span>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          </>
        )}
      </section>

      {!d.canSeeReservations && (
        <p className="note">
          Reservas, faturamento e clientes são visíveis apenas para proprietário e recepção.
        </p>
      )}
    </>
  );
}

function Kpi({ label, value, hint, accent }: { label: string; value: string; hint?: string; accent?: boolean }) {
  return (
    <div className={`kpi ${accent ? "kpi-accent" : ""}`}>
      <span className="kpi-label">{label}</span>
      <strong className="kpi-value">{value}</strong>
      {hint && <span className="kpi-hint">{hint}</span>}
    </div>
  );
}

function StatusIcon({ status }: { status: SuiteOpStatus }) {
  const p = {
    livre: <path d="m5 12 5 5 9-10" />,
    ocupada: <><circle cx="12" cy="8" r="3.2" /><path d="M5.5 20c.7-3.6 3.2-5.6 6.5-5.6s5.8 2 6.5 5.6" /></>,
    reservada: <><rect x="4" y="5" width="16" height="15" rx="2" /><path d="M4 10h16M9 3v4M15 3v4" /></>,
    desativada: <path d="M6 12h12" />,
  }[status];
  return (
    <svg viewBox="0 0 24 24" width="13" height="13" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      {p}
    </svg>
  );
}
