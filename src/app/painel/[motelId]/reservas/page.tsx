import Link from "next/link";
import { notFound } from "next/navigation";
import { can, requireMotel } from "@/lib/motel-access";
import { addDays, todayIn } from "@/lib/dashboard-data";
import { readPrices } from "@/lib/periods";
import { PageHeader } from "@/components/app/page-header";
import { NewReservation, ReservationItem, type SuiteOption, type ReservationView } from "./reservation-forms";

export const dynamic = "force-dynamic";

const TABS = [
  { id: "hoje", label: "Hoje" },
  { id: "pendentes", label: "Pedidos" },
  { id: "proximas", label: "Próximas" },
  { id: "andamento", label: "Em andamento" },
  { id: "historico", label: "Histórico" },
  { id: "todas", label: "Todas" },
] as const;
type Tab = (typeof TABS)[number]["id"];

export default async function ReservasPage({
  params,
  searchParams,
}: {
  params: Promise<{ motelId: string }>;
  searchParams: Promise<{ aba?: string; q?: string }>;
}) {
  const { motelId } = await params;
  const sp = await searchParams;
  const ctx = await requireMotel(motelId);
  // camareira nao ve dados de hospedes (mesma regra do banco)
  if (!ctx || !can(ctx.role).reservations) notFound();

  const tab: Tab = TABS.some((t) => t.id === sp.aba) ? (sp.aba as Tab) : "hoje";
  // busca: so letras, numeros, espacos e hifen (nada que mude a consulta)
  const q = (sp.q ?? "").replace(/[^\p{L}\p{N} -]/gu, "").trim().slice(0, 40);
  const today = todayIn(ctx.motel.timezone);
  const base = `/painel/${ctx.motel.id}/reservas`;

  let query = ctx.supabase
    .from("reservations")
    .select("id, code, guest_name, stay_date, period, arrival_time, total_cents, decoration, status, suite_id, created_at")
    .eq("motel_id", ctx.motel.id);
  if (tab === "hoje") query = query.eq("stay_date", today).order("arrival_time", { ascending: true });
  if (tab === "pendentes") query = query.eq("status", "pendente").order("stay_date").order("arrival_time");
  if (tab === "proximas") query = query.gt("stay_date", today).eq("status", "confirmada").order("stay_date").order("arrival_time");
  if (tab === "andamento") query = query.eq("status", "chegou").order("stay_date").order("arrival_time");
  if (tab === "historico") query = query.lt("stay_date", today).order("stay_date", { ascending: false }).order("arrival_time", { ascending: false });
  if (tab === "todas") query = query.order("stay_date", { ascending: false }).order("arrival_time", { ascending: false });
  if (q) {
    const pattern = `*${q.replace(/\s+/g, "*")}*`; // * = qualquer trecho
    query = query.or(`code.ilike.${pattern},guest_name.ilike.${pattern}`);
  }

  const [{ data: rows, error }, { data: suiteRows }, { count: pendingCount }] = await Promise.all([
    query.limit(200),
    ctx.supabase.from("suites").select("id, number, type, active, prices_cents").eq("motel_id", ctx.motel.id),
    ctx.supabase.from("reservations").select("id", { count: "exact", head: true }).eq("motel_id", ctx.motel.id).eq("status", "pendente"),
  ]);

  const suites: SuiteOption[] = (suiteRows ?? [])
    .map((s) => ({
      id: s.id as string,
      number: s.number as string,
      type: s.type as string,
      active: Boolean(s.active),
      prices: readPrices(s.prices_cents),
    }))
    .sort((a, b) => a.number.localeCompare(b.number, "pt-BR", { numeric: true }));
  const suiteNumber = new Map(suites.map((s) => [s.id, s.number]));

  const list: ReservationView[] = (rows ?? []).map((r) => ({
    id: r.id as string,
    code: r.code as string,
    guest: (r.guest_name as string | null) ?? "",
    date: r.stay_date as string,
    time: ((r.arrival_time as string | null) ?? "").slice(0, 5),
    period: r.period as ReservationView["period"],
    totalCents: r.total_cents as number,
    decoration: (r.decoration as string | null) ?? "",
    status: r.status as ReservationView["status"],
    suiteId: r.suite_id as string,
    suiteNumber: suiteNumber.get(r.suite_id as string) ?? "—",
  }));

  return (
    <>
      <PageHeader title="Reservas" subtitle="Crie, acompanhe e atualize as reservas deste estabelecimento." />

      <div className="content-card">
        <NewReservation motelId={ctx.motel.id} suites={suites.filter((s) => s.active)} today={today} maxDate={addDays(today, 365)} />

        <div className="res-toolbar">
          <nav className="segmented-links" aria-label="Filtrar reservas">
            {TABS.map((t) => (
              <Link key={t.id} href={`${base}?aba=${t.id}${q ? `&q=${encodeURIComponent(q)}` : ""}`} aria-current={t.id === tab ? "page" : undefined}>
                {t.label}
                {t.id === "pendentes" && (pendingCount ?? 0) > 0 && <span className="tab-badge">{pendingCount}</span>}
              </Link>
            ))}
          </nav>
          <form className="res-search" action={base} role="search">
            <input type="hidden" name="aba" value={tab} />
            <input name="q" defaultValue={q} placeholder="Buscar por código ou nome" aria-label="Buscar reserva" className="text-input" maxLength={40} />
            <button type="submit" className="btn-ghost">Buscar</button>
          </form>
        </div>

        {error ? (
          <p className="alert error" role="alert">Não foi possível carregar as reservas agora.</p>
        ) : list.length === 0 ? (
          <p className="empty">
            {q ? "Nenhuma reserva encontrada para essa busca." : tab === "hoje" ? "Nenhuma reserva para hoje." : tab === "pendentes" ? "Nenhum pedido de cliente aguardando." : "Nenhuma reserva aqui."}
          </p>
        ) : (
          <>
            <p className="res-count">
              {list.length} reserva{list.length === 1 ? "" : "s"}
              {list.length === 200 ? " (mostrando as 200 primeiras)" : ""}
            </p>
            <ul className="res-list">
              {list.map((r) => (
                <ReservationItem key={r.id} motelId={ctx.motel.id} r={r} suites={suites} today={today} maxDate={addDays(today, 365)} />
              ))}
            </ul>
          </>
        )}
      </div>
    </>
  );
}
