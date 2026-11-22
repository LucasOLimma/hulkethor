import { notFound } from "next/navigation";
import { requireMotel } from "@/lib/motel-access";
import { todayIn } from "@/lib/dashboard-data";
import { isMissingTable, formatQty, startOfDayIso } from "@/lib/stock";
import { CONDITION_LABEL, OPEN_TASK_STATUSES, type Condition, type TaskStatus } from "@/lib/housekeeping";
import { PageHeader } from "@/components/app/page-header";
import { RequestCleaning, TaskCard, type ItemOption, type TaskView } from "./task-forms";

export const dynamic = "force-dynamic";

const OK_MSG: Record<string, string> = {
  liberada: "Suíte liberada. Ela já aparece como livre para a recepção.",
  problema: "Problema registrado. A suíte fica bloqueada até a recepção ou o proprietário resolver.",
  resolvida: "Problema resolvido. Suíte liberada.",
};

type TaskRow = {
  id: string;
  suite_id: string;
  status: TaskStatus;
  origin: "saida" | "pedido";
  checkout_at: string;
  created_at: string;
  notes: string | null;
  condition: Condition | null;
  finished_at: string | null;
};

export default async function LimpezaPage({
  params,
  searchParams,
}: {
  params: Promise<{ motelId: string }>;
  searchParams: Promise<{ ok?: string }>;
}) {
  const { motelId } = await params;
  const sp = await searchParams;
  const ctx = await requireMotel(motelId);
  if (!ctx) notFound();
  const isDesk = ctx.role !== "camareira";
  const tz = ctx.motel.timezone;
  const todayStart = startOfDayIso(todayIn(tz), tz);

  const [open, done, suites, kits, products] = await Promise.all([
    ctx.supabase
      .from("housekeeping_tasks")
      .select("id, suite_id, status, origin, checkout_at, created_at, notes, condition, finished_at")
      .eq("motel_id", ctx.motel.id)
      .in("status", OPEN_TASK_STATUSES)
      .order("checkout_at"),
    ctx.supabase
      .from("housekeeping_tasks")
      .select("id, suite_id, status, origin, checkout_at, created_at, notes, condition, finished_at")
      .eq("motel_id", ctx.motel.id)
      .eq("status", "concluida")
      .gte("finished_at", todayStart)
      .order("finished_at", { ascending: false }),
    ctx.supabase.from("suites").select("id, number, type, active, category_id").eq("motel_id", ctx.motel.id),
    ctx.supabase.from("suite_category_kits").select("category_id, product_id, qty").eq("motel_id", ctx.motel.id),
    ctx.supabase
      .from("products")
      .select("id, name, unit, kind, active, sale_price_cents")
      .eq("motel_id", ctx.motel.id)
      .eq("active", true)
      .order("name"),
  ]);

  if (isMissingTable(open.error) || isMissingTable(suites.error)) {
    return (
      <>
        <PageHeader title="Limpeza" />
        <div className="content-card coming-soon">
          <span className="coming-soon-badge">Falta ativar</span>
          <h2>A limpeza ainda não foi ativada no banco</h2>
          <p>
            {ctx.isOwner
              ? "Rode o arquivo supabase/05_operacao.sql no SQL Editor do Supabase e recarregue esta página."
              : "Peça ao proprietário para ativar o módulo de limpeza."}
          </p>
        </div>
      </>
    );
  }

  const suiteById = new Map((suites.data ?? []).map((s) => [s.id as string, s]));
  const productById = new Map((products.data ?? []).map((p) => [p.id as string, p]));
  const kitByCategory = new Map<string, string[]>();
  for (const k of kits.data ?? []) {
    const p = productById.get(k.product_id as string);
    if (!p) continue;
    const list = kitByCategory.get(k.category_id as string) ?? [];
    list.push(`${formatQty(Number(k.qty))} × ${p.name}`);
    kitByCategory.set(k.category_id as string, list);
  }
  const time = new Intl.DateTimeFormat("pt-BR", { timeZone: tz, hour: "2-digit", minute: "2-digit" });
  const dateTime = new Intl.DateTimeFormat("pt-BR", { timeZone: tz, day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" });
  const when = (iso: string) => (iso >= todayStart ? `às ${time.format(new Date(iso))}` : `em ${dateTime.format(new Date(iso))}`);

  const toView = (t: TaskRow): TaskView => {
    const s = suiteById.get(t.suite_id);
    return {
      id: t.id,
      suiteNumber: (s?.number as string) ?? "—",
      suiteType: (s?.type as string) ?? "",
      status: t.status,
      origin: t.origin,
      when: t.origin === "saida" ? `Saída ${when(t.checkout_at)}` : `Pedida ${when(t.created_at)}`,
      notes: t.notes,
      condition: t.condition,
      kit: (s?.category_id && kitByCategory.get(s.category_id as string)) || [],
    };
  };
  const openTasks = ((open.data ?? []) as TaskRow[]).map(toView);
  const doneTasks = ((done.data ?? []) as TaskRow[]).map((t) => ({ ...toView(t), finishedAt: time.format(new Date(t.finished_at!)) }));
  const waiting = openTasks.filter((t) => t.status === "aguardando").length;
  const cleaning = openTasks.filter((t) => t.status === "em_limpeza").length;
  const problems = openTasks.filter((t) => t.status === "problema").length;

  // itens que a camareira pode informar: produtos de consumo com preco de venda (frigobar)
  const items: ItemOption[] = (products.data ?? [])
    .filter((p) => p.kind === "consumo" && p.sale_price_cents != null)
    .map((p) => ({ id: p.id as string, name: p.name as string, unit: p.unit as string }));
  const busy = new Set(((open.data ?? []) as TaskRow[]).map((t) => t.suite_id));
  const requestable = (suites.data ?? [])
    .filter((s) => s.active && !busy.has(s.id as string))
    .map((s) => ({ id: s.id as string, number: s.number as string }))
    .sort((a, b) => a.number.localeCompare(b.number, "pt-BR", { numeric: true }));

  return (
    <>
      <PageHeader
        title="Limpeza"
        subtitle={isDesk ? "Suítes que aguardam limpeza, em limpeza e liberadas hoje." : "Suas tarefas: limpe, informe o consumo e libere a suíte."}
      />
      {sp.ok && OK_MSG[sp.ok] && <p className="alert ok hk-flash" role="status">{OK_MSG[sp.ok]}</p>}

      <div className="hk-kpis">
        <div className="hk-kpi"><strong>{waiting}</strong><span>Para limpar</span></div>
        <div className="hk-kpi"><strong>{cleaning}</strong><span>Em limpeza</span></div>
        <div className="hk-kpi"><strong>{doneTasks.length}</strong><span>Liberadas hoje</span></div>
        {problems > 0 && <div className="hk-kpi bad"><strong>{problems}</strong><span>Com problema</span></div>}
      </div>

      <div className="content-card">
        {isDesk && <RequestCleaning motelId={ctx.motel.id} suites={requestable} />}
        {open.error ? (
          <p className="alert error" role="alert">Não foi possível carregar as tarefas agora.</p>
        ) : openTasks.length === 0 ? (
          <p className="empty">Nenhuma suíte aguardando limpeza. As suítes aparecem aqui sozinhas quando a recepção registra a saída.</p>
        ) : (
          <ul className="hk-list">
            {openTasks.map((t) => (
              <TaskCard key={t.id} motelId={ctx.motel.id} task={t} items={items} isDesk={isDesk} />
            ))}
          </ul>
        )}
      </div>

      {doneTasks.length > 0 && (
        <div className="content-card">
          <h2 className="card-title">Liberadas hoje</h2>
          <ul className="res-list">
            {doneTasks.map((t) => (
              <li key={t.id} className="res-item">
                <p className="res-title">
                  Suíte {t.suiteNumber}
                  {t.condition && <span className={`hk-pill p-cond-${t.condition}`}>{CONDITION_LABEL[t.condition]}</span>}
                </p>
                <p className="res-meta">
                  Liberada às {t.finishedAt}
                  {t.notes ? ` · “${t.notes}”` : ""}
                </p>
              </li>
            ))}
          </ul>
        </div>
      )}
    </>
  );
}
