import { notFound } from "next/navigation";
import { can, requireMotel } from "@/lib/motel-access";
import { todayIn } from "@/lib/dashboard-data";
import { formatCents } from "@/lib/periods";
import { isMissingTable } from "@/lib/stock";
import { PageHeader } from "@/components/app/page-header";
import { ChecklistEditor, CashMovementForm, CloseShiftForm, OpenShiftForm, type ChecklistItem } from "./shift-forms";

export const dynamic = "force-dynamic";

const METHOD_LABEL: Record<string, string> = { dinheiro: "Dinheiro", pix: "Pix", credito: "Crédito", debito: "Débito" };
type Summary = { float: number; dinheiro: number; pix: number; credito: number; debito: number; suprimentos: number; sangrias: number; expected: number };

export default async function TurnosPage({
  params,
  searchParams,
}: {
  params: Promise<{ motelId: string }>;
  searchParams: Promise<{ ok?: string; fechado?: string }>;
}) {
  const { motelId } = await params;
  const sp = await searchParams;
  const ctx = await requireMotel(motelId);
  // camareira nao tem acesso ao caixa (mesma regra do banco)
  if (!ctx || !can(ctx.role).reservations) notFound();
  const id = ctx.motel.id;
  const tz = ctx.motel.timezone;
  const today = todayIn(tz);

  const [shiftR, itemsR, suitesR, todayR, tasksR] = await Promise.all([
    ctx.supabase.from("shifts").select("id, opened_by, opened_at, opening_float_cents, checklist, opening_notes").eq("motel_id", id).eq("status", "aberto").maybeSingle(),
    ctx.supabase.from("shift_checklist_items").select("id, label").eq("motel_id", id).eq("active", true).order("position").order("created_at"),
    ctx.supabase.from("suites").select("id, active").eq("motel_id", id),
    ctx.supabase.from("reservations").select("id, suite_id, status, stay_date, total_cents").eq("motel_id", id).in("status", ["confirmada", "chegou", "concluida"]).gte("stay_date", today).lte("stay_date", today),
    ctx.supabase.from("housekeeping_tasks").select("suite_id").eq("motel_id", id).in("status", ["aguardando", "em_limpeza", "problema"]),
  ]);

  if (isMissingTable(shiftR.error) || isMissingTable(itemsR.error)) {
    return (
      <>
        <PageHeader title="Central de Turnos" />
        <div className="content-card coming-soon">
          <span className="coming-soon-badge">Falta ativar</span>
          <h2>A Central de Turnos ainda não foi ativada no banco</h2>
          <p>
            {ctx.isOwner
              ? "Rode o arquivo supabase/06_turnos_caixa.sql no SQL Editor do Supabase e recarregue esta página."
              : "Peça ao proprietário para ativar a Central de Turnos."}
          </p>
        </div>
      </>
    );
  }

  // numeros reais do motel agora
  const activeSuites = new Set((suitesR.data ?? []).filter((s) => s.active).map((s) => s.id as string));
  const occupied = new Set((todayR.data ?? []).filter((r) => r.status === "chegou").map((r) => r.suite_id as string));
  // ocupadas desde ontem (pernoite) tambem contam
  const { data: overnight } = await ctx.supabase.from("reservations").select("suite_id").eq("motel_id", id).eq("status", "chegou");
  for (const r of overnight ?? []) occupied.add(r.suite_id as string);
  const cleaning = new Set((tasksR.data ?? []).map((t) => t.suite_id as string));
  const available = [...activeSuites].filter((s) => !occupied.has(s) && !cleaning.has(s)).length;
  const reservationsToday = (todayR.data ?? []).length;
  const forecast = (todayR.data ?? []).reduce((s, r) => s + (r.total_cents as number), 0);

  const shift = shiftR.data;
  const items = (itemsR.data ?? []) as ChecklistItem[];
  const fmt = new Intl.DateTimeFormat("pt-BR", { timeZone: tz, dateStyle: "short", timeStyle: "short" });

  let summary: Summary | null = null;
  let movements: { type: string; amount_cents: number; reason: string; created_at: string }[] = [];
  let payments: { method: string; amount_cents: number; reservation_id: string; created_at: string }[] = [];
  const codes = new Map<string, string>();
  let openerLabel = "";
  if (shift) {
    const [sumR, movR, payR, memR] = await Promise.all([
      ctx.supabase.rpc("shift_summary", { p_motel: id, p_shift: shift.id }),
      ctx.supabase.from("cash_movements").select("type, amount_cents, reason, created_at").eq("shift_id", shift.id).order("created_at", { ascending: false }),
      ctx.supabase.from("payments").select("method, amount_cents, reservation_id, created_at").eq("shift_id", shift.id).order("created_at", { ascending: false }).limit(100),
      ctx.supabase.from("motel_members").select("user_id, role").eq("motel_id", id),
    ]);
    summary = sumR.data as Summary;
    movements = (movR.data ?? []) as typeof movements;
    payments = (payR.data ?? []) as typeof payments;
    const ids = [...new Set(payments.map((p) => p.reservation_id))];
    if (ids.length) {
      const { data } = await ctx.supabase.from("reservations").select("id, code").in("id", ids);
      for (const r of data ?? []) codes.set(r.id as string, r.code as string);
    }
    const role = (memR.data ?? []).find((m) => m.user_id === shift.opened_by)?.role;
    openerLabel = shift.opened_by === ctx.user.id ? "Você" : role === "dono" ? "Proprietário" : "Recepção";
  }
  const { data: handover } = shift ? { data: null } : await ctx.supabase.rpc("shift_last_handover", { p_motel: id });
  const lastNotes = (handover as { notes?: string | null; closed_at?: string } | null) ?? null;

  const history = ctx.isOwner
    ? ((
        await ctx.supabase
          .from("shifts")
          .select("id, opened_at, closed_at, opening_float_cents, expected_cash_cents, counted_cash_cents, difference_cents, handover_notes")
          .eq("motel_id", id)
          .eq("status", "fechado")
          .order("closed_at", { ascending: false })
          .limit(15)
      ).data ?? [])
    : [];

  const closedDiff = /^-?\d{1,9}$/.test(sp.fechado ?? "") ? Number(sp.fechado) : null;
  const canClose = shift && (shift.opened_by === ctx.user.id || ctx.isOwner);

  return (
    <>
      <PageHeader title="Central de Turnos" subtitle="Abertura e fechamento do turno, caixa e passagem de plantão." />

      {sp.ok === "aberto" && <p className="alert ok hk-flash" role="status">Turno aberto. Bom trabalho!</p>}
      {closedDiff !== null && (
        <p className={`alert ${closedDiff === 0 ? "ok" : "error"} hk-flash`} role="status">
          Turno fechado.{" "}
          {closedDiff === 0
            ? "O caixa bateu certinho."
            : closedDiff > 0
              ? `Sobrou ${formatCents(closedDiff)} no caixa em relação ao esperado.`
              : `Faltou ${formatCents(-closedDiff)} no caixa em relação ao esperado.`}
        </p>
      )}

      <div className="shift-kpis">
        <div className="hk-kpi"><strong>{occupied.size}</strong><span>Suítes ocupadas</span></div>
        <div className="hk-kpi"><strong>{cleaning.size}</strong><span>Em limpeza</span></div>
        <div className="hk-kpi"><strong>{available}</strong><span>Disponíveis</span></div>
        <div className="hk-kpi"><strong>{reservationsToday}</strong><span>Reservas hoje</span></div>
        <div className="hk-kpi"><strong className="small">{formatCents(forecast)}</strong><span>Previsto hoje (reservas)</span></div>
      </div>

      {!shift ? (
        <div className="content-card">
          <div className="shift-head">
            <h2 className="card-title">Abertura de turno</h2>
            <span className="hk-pill">Pendente</span>
          </div>
          {lastNotes?.notes && (
            <div className="handover">
              <strong>Passagem de plantão do turno anterior</strong>
              <p>{lastNotes.notes}</p>
              {lastNotes.closed_at && <small>Fechado em {fmt.format(new Date(lastNotes.closed_at))}</small>}
            </div>
          )}
          <p className="res-hint">Antes de iniciar o atendimento, confira todos os itens.</p>
          <OpenShiftForm motelId={id} items={items} />
        </div>
      ) : (
        <div className="shift-grid">
          <div className="content-card">
            <div className="shift-head">
              <h2 className="card-title">Turno atual</h2>
              <span className="hk-pill p-cond-ok">Aberto</span>
            </div>
            <dl className="info-list shift-info">
              <div><dt>Aberto por</dt><dd>{openerLabel}</dd></div>
              <div><dt>Início</dt><dd>{fmt.format(new Date(shift.opened_at as string))}</dd></div>
            </dl>
            {shift.opening_notes && <p className="hk-notes">“{shift.opening_notes as string}”</p>}

            {summary && (
              <table className="data-table cash-table">
                <tbody>
                  <tr><td>Fundo de caixa (abertura)</td><td className="num">{formatCents(summary.float)}</td></tr>
                  <tr><td>Recebido em dinheiro</td><td className="num">{formatCents(summary.dinheiro)}</td></tr>
                  <tr><td>Suprimentos</td><td className="num">{formatCents(summary.suprimentos)}</td></tr>
                  <tr><td>Sangrias</td><td className="num neg">− {formatCents(summary.sangrias)}</td></tr>
                  <tr className="bill-total"><td>Dinheiro esperado no caixa</td><td className="num">{formatCents(summary.expected)}</td></tr>
                  <tr><td className="muted">Pix</td><td className="num muted">{formatCents(summary.pix)}</td></tr>
                  <tr><td className="muted">Cartão de crédito</td><td className="num muted">{formatCents(summary.credito)}</td></tr>
                  <tr><td className="muted">Cartão de débito</td><td className="num muted">{formatCents(summary.debito)}</td></tr>
                </tbody>
              </table>
            )}
            <div className="shift-actions">
              {canClose ? <CloseShiftForm motelId={id} shiftId={shift.id as string} /> : <p className="res-hint">Quem fecha é quem abriu o turno (ou o proprietário).</p>}
            </div>
          </div>

          <div className="content-card">
            <h2 className="card-title">Sangria e suprimento</h2>
            <CashMovementForm motelId={id} />
            {movements.length > 0 && (
              <ul className="res-list cash-list">
                {movements.map((m, i) => (
                  <li key={i} className="res-item">
                    <p className="res-title">
                      {m.type === "sangria" ? "Sangria" : "Suprimento"} · {formatCents(m.amount_cents)}
                    </p>
                    <p className="res-meta">{fmt.format(new Date(m.created_at))} · {m.reason}</p>
                  </li>
                ))}
              </ul>
            )}
            <h2 className="card-title spaced">Recebimentos deste turno</h2>
            {payments.length === 0 ? (
              <p className="empty small">Nenhum pagamento recebido ainda. Os pagamentos entram aqui quando a recepção registra a saída.</p>
            ) : (
              <table className="data-table">
                <tbody>
                  {payments.map((p, i) => (
                    <tr key={i}>
                      <td>{fmt.format(new Date(p.created_at))}</td>
                      <td className="mono">{codes.get(p.reservation_id) ?? "—"}</td>
                      <td>{METHOD_LABEL[p.method]}{p.amount_cents < 0 ? " (estorno)" : ""}</td>
                      <td className={`num ${p.amount_cents < 0 ? "neg" : ""}`}>{formatCents(p.amount_cents)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>
        </div>
      )}

      {ctx.isOwner && (
        <div className="shift-grid">
          <div className="content-card">
            <h2 className="card-title">Histórico de turnos</h2>
            {history.length === 0 ? (
              <p className="empty small">Nenhum turno fechado ainda.</p>
            ) : (
              <div className="table-wrap">
                <table className="data-table">
                  <thead>
                    <tr><th>Fechado em</th><th className="num">Esperado</th><th className="num">Contado</th><th className="num">Diferença</th></tr>
                  </thead>
                  <tbody>
                    {history.map((h) => {
                      const d = h.difference_cents as number;
                      return (
                        <tr key={h.id as string} title={(h.handover_notes as string | null) ?? undefined}>
                          <td>{fmt.format(new Date(h.closed_at as string))}</td>
                          <td className="num">{formatCents(h.expected_cash_cents as number)}</td>
                          <td className="num">{formatCents(h.counted_cash_cents as number)}</td>
                          <td className={`num ${d < 0 ? "neg" : d > 0 ? "warn-text" : ""}`}>{d === 0 ? "OK" : formatCents(d)}</td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            )}
          </div>
          <div className="content-card">
            <h2 className="card-title">Lista de conferência da abertura</h2>
            <p className="res-hint">Só o proprietário edita. Os turnos já abertos guardam a lista como estava.</p>
            <ChecklistEditor motelId={id} items={items} />
          </div>
        </div>
      )}
    </>
  );
}
