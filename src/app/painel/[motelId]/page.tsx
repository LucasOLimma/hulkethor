import Image from "next/image";
import Link from "next/link";
import { notFound } from "next/navigation";
import { requireMotel } from "@/lib/motel-access";
import {
  addDays,
  loadDashboard,
  parsePeriod,
  PERIOD_OPTIONS,
  STATUS_LABEL,
  type SuiteOpStatus,
} from "@/lib/dashboard-data";
import { formatCents, PERIOD_LABEL, PERIODS, readPrices, type Period } from "@/lib/periods";
import { TimeChart } from "@/components/app/charts";
import { Icon, type IconName } from "@/components/app/app-shell";

export const dynamic = "force-dynamic";

const OP_LABEL: Record<SuiteOpStatus, string> = {
  livre: "Livre",
  ocupada: "Ocupada",
  reservada: "Reservada hoje",
  desativada: "Desativada",
};

const int = new Intl.NumberFormat("pt-BR");
const dayLabel = (iso: string) => `${iso.slice(8, 10)}/${iso.slice(5, 7)}`;

/** Variacao percentual real em relacao ao periodo anterior. */
function delta(cur: number, prev: number) {
  if (prev === 0) return cur === 0 ? { text: "0%", dir: "flat" as const } : { text: "novo", dir: "up" as const };
  const pct = Math.round(((cur - prev) / prev) * 100);
  return { text: `${pct > 0 ? "+" : ""}${pct}%`, dir: pct > 0 ? ("up" as const) : pct < 0 ? ("down" as const) : ("flat" as const) };
}

function initialsOf(name: string | null) {
  if (!name) return "—";
  return name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((w) => w[0]!.toUpperCase())
    .join("");
}

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
  const monthDelta = delta(d.month.revenueCents, d.month.prevRevenueCents);
  const tomorrow = addDays(d.today, 1);
  const when = (iso: string) => (iso === d.today ? "Hoje" : iso === tomorrow ? "Amanhã" : dayLabel(iso));

  // monta a "linha de evolucao" do mes (faturamento acumulado dia a dia)
  const monthCumulative = d.month.daily.reduce<number[]>((out, x) => [...out, (out.at(-1) ?? 0) + x.revenueCents], []);

  return (
    <>
      {/* ---------- destaque ---------- */}
      <section className="dash-hero">
        <Image src="/login/suite.jpg" alt="" fill priority sizes="(max-width: 980px) 100vw, 1100px" className="dash-hero-img" />
        <div className="dash-hero-shade" />
        <div className="dash-hero-text">
          <h1>
            Seu motel sempre
            <br />
            <em>no próximo nível</em>
          </h1>
          <p>Acompanhe suas reservas, gerencie suas suítes e ofereça uma experiência inesquecível.</p>
          <Link href={ctx.isOwner ? `${base}/relatorios` : `${base}/suites`} className="btn-gold">
            <Icon name="relatorios" />
            {ctx.isOwner ? "Ver relatórios" : "Ver suítes"} →
          </Link>
        </div>

        {d.canSeeReservations && (
          <div className="perf-card">
            <p className="perf-title">
              <Icon name="trend" /> Performance do mês
            </p>
            <strong className="perf-value">{formatCents(d.month.revenueCents)}</strong>
            <p className={`perf-delta ${monthDelta.dir}`}>
              {monthDelta.dir === "up" ? "↑" : monthDelta.dir === "down" ? "↓" : "•"} {monthDelta.text}{" "}
              <span>em relação ao mesmo período do mês anterior</span>
            </p>
            <Sparkline values={monthCumulative} width={280} height={90} dots />
          </div>
        )}
      </section>

      {d.error && (
        <p className="alert error" role="alert">
          Parte dos dados não pôde ser carregada agora. Recarregue a página.
        </p>
      )}

      {/* ---------- indicadores ---------- */}
      <div className="section-bar">
        <h2>Indicadores · últimos {days} dias</h2>
        {d.canSeeReservations && (
          <nav className="segmented-links" aria-label="Período">
            {PERIOD_OPTIONS.map((p) => (
              <Link key={p} href={`${base}?periodo=${p}`} aria-current={p === days ? "page" : undefined}>
                {p} dias
              </Link>
            ))}
          </nav>
        )}
      </div>
      <section className="kpi-row" aria-label="Indicadores">
        {d.canSeeReservations && (
          <>
            <KpiCard
              icon="reservas"
              value={int.format(k.reservations)}
              label="Total de reservas"
              trend={delta(k.reservations, d.prev.reservations)}
              series={d.daily.map((x) => x.reservations)}
            />
            <KpiCard
              icon="users"
              value={int.format(k.served)}
              label="Clientes atendidos"
              trend={delta(k.served, d.prev.served)}
              series={d.daily.map((x) => x.served)}
            />
          </>
        )}
        <KpiCard
          icon="suites"
          value={int.format(k.activeSuites)}
          label="Suítes ativas"
          sub={`${k.suitesAvailable} livre${k.suitesAvailable === 1 ? "" : "s"} agora`}
        />
        <KpiCard
          icon="percent"
          value={k.occupancy === null ? "—" : `${Math.round(k.occupancy * 100)}%`}
          label="Taxa de ocupação"
          sub={k.occupancy === null ? "sem suítes ativas" : `${k.occupiedNow} de ${k.activeSuites} ocupadas agora`}
        />
      </section>

      {/* ---------- suites em destaque + reservas recentes ---------- */}
      <section className={`dash-grid ${d.canSeeReservations ? "split" : ""}`}>
        <div className="content-card">
          <div className="card-head">
            <h2 className="card-title with-icon">
              <Icon name="suites" /> Suítes em destaque
            </h2>
            <Link href={`${base}/suites`} className="card-link">
              Ver todas →
            </Link>
          </div>
          {d.showcase.length === 0 ? (
            <p className="empty small">Nenhuma suíte ativa cadastrada.</p>
          ) : (
            <ul className="showcase">
              {d.showcase.map(({ suite, count }) => {
                const prices = readPrices(suite.prices_cents);
                const shown: Period | undefined = prices.pernoite !== undefined ? "pernoite" : PERIODS.find((p) => prices[p] !== undefined);
                const items = (suite.items ?? []).slice(0, 2);
                return (
                  <li key={suite.id} className="showcase-card">
                    <div className="showcase-cover" aria-hidden="true">
                      <span>{suite.number}</span>
                      <small>Sem foto cadastrada</small>
                    </div>
                    <div className="showcase-body">
                      <h3>Suíte {suite.number}</h3>
                      <p className="showcase-type">{suite.type}</p>
                      {items.length > 0 && (
                        <p className="showcase-items">
                          {items.map((it) => (
                            <span key={it}>{it}</span>
                          ))}
                        </p>
                      )}
                      <p className="showcase-price">
                        {shown ? (
                          <>
                            <strong>{formatCents(prices[shown]!)}</strong> / {PERIOD_LABEL[shown].toLowerCase()}
                          </>
                        ) : (
                          "Sem preço cadastrado"
                        )}
                      </p>
                      {d.canSeeReservations && (
                        <p className="showcase-count">
                          {count} reserva{count === 1 ? "" : "s"} no período
                        </p>
                      )}
                      <Link href={`${base}/suites`} className="btn-outline">
                        Gerenciar
                      </Link>
                    </div>
                  </li>
                );
              })}
            </ul>
          )}
        </div>

        {d.canSeeReservations && (
          <div className="content-card">
            <div className="card-head">
              <h2 className="card-title with-icon">
                <Icon name="reservas" /> Reservas recentes
              </h2>
              <Link href={`${base}/reservas`} className="card-link">
                Ver todas →
              </Link>
            </div>
            {d.recent.length === 0 ? (
              <p className="empty small">Nenhuma reserva registrada ainda.</p>
            ) : (
              <ul className="guest-list">
                {d.recent.slice(0, 6).map((r) => (
                  <li key={r.id}>
                    <span className="guest-avatar" aria-hidden="true">
                      {initialsOf(r.guest_name)}
                    </span>
                    <span className="guest-info">
                      <strong>{r.guest_name || "Hóspede não informado"}</strong>
                      <small>
                        {when(r.stay_date)}
                        {r.arrival_time ? ` • ${r.arrival_time.slice(0, 5)}` : ""} • Suíte {r.suiteNumber}
                      </small>
                    </span>
                    <span className={`status-pill s-${r.status}`}>{STATUS_LABEL[r.status] ?? r.status}</span>
                  </li>
                ))}
              </ul>
            )}
          </div>
        )}
      </section>

      {/* ---------- analise do periodo ---------- */}
      {d.canSeeReservations && (
        <section className="dash-grid two">
          <div className="content-card">
            <h2 className="card-title">Faturamento por dia · {formatCents(k.revenueCents)}</h2>
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

      <section className="content-card">
        <div className="card-head">
          <h2 className="card-title">Situação das suítes agora</h2>
          <Link href={`${base}/suites`} className="card-link">
            Gerenciar →
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
      </section>

      {!d.canSeeReservations && (
        <p className="note">Reservas, faturamento e clientes são visíveis apenas para proprietário e recepção.</p>
      )}
    </>
  );
}

function KpiCard({
  icon,
  value,
  label,
  trend,
  sub,
  series,
}: {
  icon: IconName;
  value: string;
  label: string;
  trend?: { text: string; dir: "up" | "down" | "flat" };
  sub?: string;
  series?: number[];
}) {
  return (
    <div className="kpi2">
      <span className="kpi2-icon">
        <Icon name={icon} size={30} />
      </span>
      <div className="kpi2-main">
        <strong>{value}</strong>
        <span>{label}</span>
        {sub && <small>{sub}</small>}
      </div>
      {trend && (
        <span className={`kpi2-trend ${trend.dir}`} title="Em relação ao período anterior">
          {trend.dir === "up" ? "↑" : trend.dir === "down" ? "↓" : "•"} {trend.text}
        </span>
      )}
      {series && series.some((v) => v > 0) && (
        <div className="kpi2-spark">
          <Sparkline values={series} width={130} height={34} />
        </div>
      )}
    </div>
  );
}

/** Mini-linha de tendencia (so decorativa: os numeros estao no cartao). */
function Sparkline({ values, width, height, dots }: { values: number[]; width: number; height: number; dots?: boolean }) {
  if (values.length < 2) return null;
  const max = Math.max(...values, 1);
  const pad = 5;
  const x = (i: number) => pad + (i / (values.length - 1)) * (width - pad * 2);
  const y = (v: number) => height - pad - (v / max) * (height - pad * 2);
  const line = values.map((v, i) => `${i ? "L" : "M"}${x(i).toFixed(1)},${y(v).toFixed(1)}`).join("");
  const area = `${line}L${x(values.length - 1).toFixed(1)},${height}L${x(0).toFixed(1)},${height}Z`;
  const step = Math.max(1, Math.ceil(values.length / 8));
  return (
    <svg className="sparkline" viewBox={`0 0 ${width} ${height}`} width="100%" height={height} preserveAspectRatio={dots ? "xMidYMid meet" : "none"} aria-hidden="true">
      <path d={area} className="spark-area" />
      <path d={line} className="spark-line" vectorEffect="non-scaling-stroke" />
      {dots &&
        values.map((v, i) =>
          i % step === 0 || i === values.length - 1 ? <circle key={i} cx={x(i)} cy={y(v)} r={3} className="spark-dot" /> : null,
        )}
    </svg>
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
