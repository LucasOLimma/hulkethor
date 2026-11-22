import Link from "next/link";
import { notFound } from "next/navigation";
import { requireMotel, type Role } from "@/lib/motel-access";
import { formatCents } from "@/lib/periods";
import { addDays, todayIn } from "@/lib/dashboard-data";
import {
  ALERT_LABEL,
  KIND_LABEL,
  LOCATION_LABEL,
  MOVEMENT_LABEL,
  formatDateBR,
  formatQty,
  isMissingTable,
  readAlerts,
  startOfDayIso,
  type Location,
  type ProductKind,
  type Unit,
} from "@/lib/stock";
import { PageHeader } from "@/components/app/page-header";
import {
  CategoryManager,
  CountForm,
  EntryForm,
  ExitForm,
  InventoryOwnerActions,
  NewProduct,
  NewSupplier,
  OpenInventoryForm,
  ProductRow,
  ReverseButton,
  SupplierRow,
  TransferForm,
  type Category,
  type CountRow,
  type Product,
  type Supplier,
} from "./stock-forms";

export const dynamic = "force-dynamic";

type Tab = "saldos" | "movimentar" | "conferencia" | "historico" | "consumo" | "cadastros";
const TABS: { id: Tab; label: string; roles: Role[] }[] = [
  { id: "saldos", label: "Saldos", roles: ["dono", "recepcao", "camareira"] },
  { id: "movimentar", label: "Movimentar", roles: ["dono", "recepcao"] },
  { id: "conferencia", label: "Conferência", roles: ["dono", "recepcao"] },
  { id: "historico", label: "Histórico", roles: ["dono", "recepcao"] },
  { id: "consumo", label: "Consumo", roles: ["dono", "recepcao"] },
  { id: "cadastros", label: "Cadastros", roles: ["dono"] },
];
const EXIT_TYPES = ["consumo", "uso_interno", "perda", "avaria", "vencimento"];

type Ctx = NonNullable<Awaited<ReturnType<typeof requireMotel>>>;
type Search = { aba?: string; cat?: string; tipo?: string; produto?: string; dias?: string; fechada?: string; cancelada?: string };

function mapProduct(r: Record<string, unknown>): Product {
  return {
    id: r.id as string,
    name: r.name as string,
    unit: r.unit as Unit,
    kind: r.kind as ProductKind,
    tracksExpiry: Boolean(r.tracks_expiry),
    active: Boolean(r.active),
    categoryId: r.category_id as string,
    minQty: Number(r.min_qty),
    salePriceCents: (r.sale_price_cents as number | null) ?? null,
    sku: (r.sku as string | null) ?? null,
  };
}

async function loadProducts(ctx: Ctx) {
  const [p, c] = await Promise.all([
    ctx.supabase
      .from("products")
      .select("id, name, unit, kind, tracks_expiry, active, category_id, min_qty, sale_price_cents, sku")
      .eq("motel_id", ctx.motel.id)
      .order("name"),
    ctx.supabase.from("stock_categories").select("id, name").eq("motel_id", ctx.motel.id).order("name"),
  ]);
  const products = (p.data ?? []).map(mapProduct);
  const categories: Category[] = (c.data ?? []).map((r) => ({
    id: r.id as string,
    name: r.name as string,
    productCount: products.filter((x) => x.categoryId === r.id).length,
  }));
  return { products, categories, error: p.error ?? c.error };
}

export default async function EstoquePage({
  params,
  searchParams,
}: {
  params: Promise<{ motelId: string }>;
  searchParams: Promise<Search>;
}) {
  const { motelId } = await params;
  const sp = await searchParams;
  const ctx = await requireMotel(motelId);
  if (!ctx) notFound();

  const tabs = TABS.filter((t) => t.roles.includes(ctx.role));
  const tab: Tab = tabs.some((t) => t.id === sp.aba) ? (sp.aba as Tab) : "saldos";
  const base = `/painel/${ctx.motel.id}/estoque`;

  const { products, categories, error } = await loadProducts(ctx);
  if (isMissingTable(error)) {
    return (
      <>
        <PageHeader title="Estoque" />
        <div className="content-card coming-soon">
          <span className="coming-soon-badge">Falta ativar</span>
          <h2>O estoque ainda não foi ativado no banco</h2>
          <p>
            {ctx.isOwner
              ? "Rode o arquivo supabase/04_estoque.sql no SQL Editor do Supabase e recarregue esta página."
              : "Peça ao proprietário para ativar o módulo de estoque."}
          </p>
        </div>
      </>
    );
  }

  return (
    <>
      <PageHeader
        title="Estoque"
        subtitle={
          ctx.role === "camareira"
            ? "Consulte o que há disponível no estoque, nas suítes e na lavanderia."
            : "Produtos, entradas e saídas, enxoval, conferências e histórico."
        }
      />
      <div className="content-card">
        <nav className="segmented-links stock-tabs" aria-label="Seções do estoque">
          {tabs.map((t) => (
            <Link key={t.id} href={`${base}?aba=${t.id}`} aria-current={t.id === tab ? "page" : undefined}>
              {t.label}
            </Link>
          ))}
        </nav>

        {error ? (
          <p className="alert error" role="alert">Não foi possível carregar o estoque agora. Tente novamente.</p>
        ) : tab === "saldos" ? (
          <Saldos ctx={ctx} products={products} categories={categories} cat={sp.cat} base={base} />
        ) : tab === "movimentar" ? (
          <Movimentar ctx={ctx} products={products} />
        ) : tab === "conferencia" ? (
          <Conferencia ctx={ctx} products={products} sp={sp} />
        ) : tab === "historico" ? (
          <Historico ctx={ctx} products={products} sp={sp} base={base} />
        ) : tab === "consumo" ? (
          <Consumo ctx={ctx} products={products} categories={categories} sp={sp} base={base} />
        ) : (
          <Cadastros ctx={ctx} products={products} categories={categories} />
        )}
      </div>
    </>
  );
}

// ---------------------------------------------------------------------
// SALDOS (toda a equipe; custos so para o dono)
// ---------------------------------------------------------------------
async function Saldos({ ctx, products, categories, cat, base }: { ctx: Ctx; products: Product[]; categories: Category[]; cat?: string; base: string }) {
  const [levels, lots, costs, alertsRes] = await Promise.all([
    ctx.supabase.from("stock_levels").select("product_id, location, qty").eq("motel_id", ctx.motel.id),
    ctx.supabase.from("stock_lots").select("product_id, expires_on").eq("motel_id", ctx.motel.id).gt("qty_remaining", 0).not("expires_on", "is", null).order("expires_on"),
    ctx.isOwner
      ? ctx.supabase.from("product_costs").select("product_id, avg_cost_cents").eq("motel_id", ctx.motel.id)
      : Promise.resolve({ data: [] as { product_id: string; avg_cost_cents: number | null }[] }),
    ctx.supabase.rpc("stock_alerts", { p_motel: ctx.motel.id }),
  ]);

  const qty = new Map<string, number>();
  for (const l of levels.data ?? []) qty.set(`${l.product_id}:${l.location}`, Number(l.qty));
  const nextExpiry = new Map<string, string>();
  for (const l of lots.data ?? []) if (!nextExpiry.has(l.product_id as string)) nextExpiry.set(l.product_id as string, l.expires_on as string);
  const avg = new Map<string, number>();
  for (const c of costs.data ?? []) if (c.avg_cost_cents != null) avg.set(c.product_id as string, Number(c.avg_cost_cents));
  const alerts = readAlerts(alertsRes.data);
  const catName = new Map(categories.map((c) => [c.id, c.name]));
  const today = todayIn(ctx.motel.timezone);

  const shown = products.filter((p) => p.active && (!cat || p.categoryId === cat));
  const hasEnxoval = shown.some((p) => p.kind === "enxoval");
  const get = (p: Product, l: Location) => qty.get(`${p.id}:${l}`) ?? 0;
  const value = ctx.isOwner ? shown.reduce((s, p) => s + Math.max(get(p, "estoque"), 0) * (avg.get(p.id) ?? 0), 0) : 0;

  if (products.length === 0) {
    return (
      <p className="empty">
        {ctx.isOwner ? "Nenhum produto cadastrado ainda. Comece em “Cadastros”." : "Nenhum produto cadastrado ainda."}
      </p>
    );
  }

  return (
    <>
      {alerts.length > 0 && (
        <section className="stock-alerts" aria-label="Alertas do estoque">
          <h3>Alertas ({alerts.length})</h3>
          <ul>
            {alerts.map((a, i) => (
              <li key={i} className={`stock-alert a-${a.kind}`}>
                <span className="stock-alert-tag">{ALERT_LABEL[a.kind]}</span>
                <strong>{a.productName}</strong>
                <span>
                  {a.kind === "negativo" && `${LOCATION_LABEL[a.location]}: ${formatQty(a.qty, a.unit)}. Confira as entradas ou faça uma conferência.`}
                  {a.kind === "abaixo_minimo" && `${formatQty(a.qty, a.unit)} no estoque (mínimo ${formatQty(a.minQty, a.unit)}).`}
                  {(a.kind === "vencendo" || a.kind === "vencido") &&
                    `${formatQty(a.qty, a.unit)}${a.lotCode ? ` do lote ${a.lotCode}` : ""} ${a.kind === "vencido" ? "venceu em" : "vence em"} ${formatDateBR(a.expiresOn!)}.`}
                </span>
              </li>
            ))}
          </ul>
        </section>
      )}

      <div className="res-toolbar">
        <nav className="chip-filter" aria-label="Filtrar por categoria">
          <Link href={`${base}?aba=saldos`} aria-current={!cat ? "page" : undefined}>Todas</Link>
          {categories.map((c) => (
            <Link key={c.id} href={`${base}?aba=saldos&cat=${c.id}`} aria-current={cat === c.id ? "page" : undefined}>
              {c.name}
            </Link>
          ))}
        </nav>
        {ctx.isOwner && <p className="stock-value">Valor em estoque (custo médio): <strong>{formatCents(Math.round(value))}</strong></p>}
      </div>

      {shown.length === 0 ? (
        <p className="empty">Nenhum produto ativo nesta categoria.</p>
      ) : (
        <div className="table-wrap">
          <table className="data-table stock-table">
            <thead>
              <tr>
                <th>Produto</th>
                <th className="num">Estoque</th>
                {hasEnxoval && <th className="num">Nas suítes</th>}
                {hasEnxoval && <th className="num">Lavanderia</th>}
                <th className="num">Mínimo</th>
                <th>Validade mais próxima</th>
                {ctx.isOwner && <th className="num">Custo médio</th>}
                <th>Situação</th>
              </tr>
            </thead>
            <tbody>
              {shown.map((p) => {
                const s = get(p, "estoque");
                const exp = nextExpiry.get(p.id);
                const status =
                  [get(p, "estoque"), get(p, "em_uso"), get(p, "lavanderia")].some((v) => v < 0)
                    ? { cls: "bad", text: "Negativo" }
                    : p.minQty > 0 && s <= p.minQty
                      ? { cls: "warn", text: "Abaixo do mínimo" }
                      : { cls: "ok", text: "OK" };
                return (
                  <tr key={p.id}>
                    <td>
                      <strong>{p.name}</strong>
                      <small className="stock-sub">{catName.get(p.categoryId)} · {KIND_LABEL[p.kind]}</small>
                    </td>
                    <td className={`num ${s < 0 ? "neg" : ""}`}>{formatQty(s, p.unit)}</td>
                    {hasEnxoval && <td className="num">{p.kind === "enxoval" ? formatQty(get(p, "em_uso"), p.unit) : "—"}</td>}
                    {hasEnxoval && <td className="num">{p.kind === "enxoval" ? formatQty(get(p, "lavanderia"), p.unit) : "—"}</td>}
                    <td className="num">{p.minQty > 0 ? formatQty(p.minQty, p.unit) : "—"}</td>
                    <td className={exp && exp < today ? "neg" : exp && exp <= addDays(today, 15) ? "warn-text" : undefined}>
                      {exp ? formatDateBR(exp) : "—"}
                    </td>
                    {ctx.isOwner && <td className="num">{avg.has(p.id) ? formatCents(Math.round(avg.get(p.id)!)) : "—"}</td>}
                    <td><span className={`stock-status ${status.cls}`}>{status.text}</span></td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </>
  );
}

// ---------------------------------------------------------------------
// MOVIMENTAR (dono e recepcao)
// ---------------------------------------------------------------------
async function Movimentar({ ctx, products }: { ctx: Ctx; products: Product[] }) {
  const active = products.filter((p) => p.active);
  const suppliers = ctx.isOwner
    ? ((await ctx.supabase.from("suppliers").select("id, name, document, phone, email, notes, active").eq("motel_id", ctx.motel.id).order("name")).data ?? []) as Supplier[]
    : [];
  if (active.length === 0) {
    return <p className="empty">{ctx.isOwner ? "Cadastre produtos em “Cadastros” para começar a movimentar." : "Nenhum produto cadastrado ainda."}</p>;
  }
  return (
    <div className="stock-move-grid">
      {ctx.isOwner && (
        <div className="panel-box">
          <EntryForm motelId={ctx.motel.id} products={active} suppliers={suppliers} />
        </div>
      )}
      <div className="panel-box">
        <ExitForm motelId={ctx.motel.id} products={active} isOwner={ctx.isOwner} />
      </div>
      <div className="panel-box">
        <TransferForm motelId={ctx.motel.id} products={active.filter((p) => p.kind === "enxoval")} />
      </div>
      {!ctx.isOwner && (
        <p className="res-hint">Entradas de mercadoria, custos, perdas, avarias e estornos são registrados pelo proprietário.</p>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------
// CONFERENCIA (dono e recepcao contam; so o dono fecha)
// ---------------------------------------------------------------------
async function Conferencia({ ctx, products, sp }: { ctx: Ctx; products: Product[]; sp: Search }) {
  const { data: invs } = await ctx.supabase
    .from("inventory_counts")
    .select("id, location, status, opened_at, closed_at")
    .eq("motel_id", ctx.motel.id)
    .order("opened_at", { ascending: false })
    .limit(15);
  const open = (invs ?? []).filter((i) => i.status === "aberto");
  const past = (invs ?? []).filter((i) => i.status !== "aberto").slice(0, 10);
  const ids = (invs ?? []).map((i) => i.id as string);

  const [items, levels] = await Promise.all([
    ids.length
      ? ctx.supabase.from("inventory_count_items").select("inventory_id, product_id, counted_qty, system_qty").in("inventory_id", ids)
      : Promise.resolve({ data: [] as { inventory_id: string; product_id: string; counted_qty: number; system_qty: number | null }[] }),
    ctx.isOwner && open.length
      ? ctx.supabase.from("stock_levels").select("product_id, location, qty").eq("motel_id", ctx.motel.id)
      : Promise.resolve({ data: [] as { product_id: string; location: string; qty: number }[] }),
  ]);
  const level = new Map((levels.data ?? []).map((l) => [`${l.product_id}:${l.location}`, Number(l.qty)]));
  const fmt = new Intl.DateTimeFormat("pt-BR", { timeZone: ctx.motel.timezone, dateStyle: "short", timeStyle: "short" });

  const closedN = /^\d{1,4}$/.test(sp.fechada ?? "") ? Number(sp.fechada) : null;
  return (
    <div className="stock-inventory">
      {closedN !== null && (
        <p className="alert ok" role="status">
          {closedN === 0 ? "Conferência fechada: tudo bateu, nenhum ajuste." : `Conferência fechada: ${closedN} ${closedN === 1 ? "ajuste lançado" : "ajustes lançados"} (veja no Histórico).`}
        </p>
      )}
      {sp.cancelada === "1" && <p className="alert ok" role="status">Conferência cancelada. Nenhum saldo foi alterado.</p>}
      <p className="res-hint">
        Conte o que existe de verdade e salve. {ctx.isOwner ? "Ao fechar, o sistema lança um ajuste para cada diferença (tudo fica no histórico)." : "Quem fecha e ajusta os saldos é o proprietário. A contagem é feita sem ver o saldo do sistema."}
      </p>
      <OpenInventoryForm motelId={ctx.motel.id} busy={open.map((o) => o.location as Location)} />

      {open.map((inv) => {
        const loc = inv.location as Location;
        const its = (items.data ?? []).filter((i) => i.inventory_id === inv.id);
        const rows: CountRow[] = products
          .filter((p) => p.active && (loc === "estoque" || p.kind === "enxoval"))
          .map((p) => {
            const it = its.find((i) => i.product_id === p.id);
            return {
              productId: p.id,
              name: p.name,
              unit: p.unit,
              counted: it ? Number(it.counted_qty) : null,
              system: ctx.isOwner ? (level.get(`${p.id}:${loc}`) ?? 0) : null,
            };
          });
        return (
          <section key={inv.id as string} className="panel-box stock-inv-open">
            <div className="panel-box-head">
              <h3>Conferência aberta: {LOCATION_LABEL[loc]}</h3>
              <small className="res-meta">Aberta em {fmt.format(new Date(inv.opened_at as string))} · {its.length} de {rows.length} contados</small>
            </div>
            {rows.length === 0 ? (
              <p className="empty small">Nenhum item para conferir neste local.</p>
            ) : (
              <CountForm motelId={ctx.motel.id} inventoryId={inv.id as string} rows={rows} showSystem={ctx.isOwner} />
            )}
            {ctx.isOwner && <InventoryOwnerActions motelId={ctx.motel.id} inventoryId={inv.id as string} />}
          </section>
        );
      })}

      {past.length > 0 && (
        <section>
          <h3 className="section-title">Conferências anteriores</h3>
          <ul className="res-list">
            {past.map((inv) => {
              const its = (items.data ?? []).filter((i) => i.inventory_id === inv.id);
              const diffs = its.filter((i) => i.system_qty !== null && Number(i.counted_qty) !== Number(i.system_qty)).length;
              return (
                <li key={inv.id as string} className="res-item">
                  <p className="res-title">
                    {LOCATION_LABEL[inv.location as Location]}
                    <span className={`status-pill ${inv.status === "fechado" ? "s-concluida" : "s-cancelada"}`}>
                      {inv.status === "fechado" ? "Fechada" : "Cancelada"}
                    </span>
                  </p>
                  <p className="res-meta">
                    {fmt.format(new Date((inv.closed_at ?? inv.opened_at) as string))} · {its.length} itens contados
                    {inv.status === "fechado" ? ` · ${diffs} com diferença` : ""}
                  </p>
                </li>
              );
            })}
          </ul>
        </section>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------
// HISTORICO (dono e recepcao; custo e estorno so para o dono)
// ---------------------------------------------------------------------
async function Historico({ ctx, products, sp, base }: { ctx: Ctx; products: Product[]; sp: Search; base: string }) {
  const tipo = sp.tipo && MOVEMENT_LABEL[sp.tipo] ? sp.tipo : "";
  const produto = products.some((p) => p.id === sp.produto) ? sp.produto! : "";

  let q = ctx.supabase
    .from("stock_movements")
    .select("id, product_id, type, qty, from_location, to_location, reason, invoice_number, reverses_id, created_by, created_at, lot_id")
    .eq("motel_id", ctx.motel.id)
    .order("created_at", { ascending: false })
    .limit(200);
  if (tipo) q = q.eq("type", tipo);
  if (produto) q = q.eq("product_id", produto);
  const { data: rows, error } = await q;

  const ids = (rows ?? []).map((r) => r.id as string);
  const reversed = new Set<string>();
  const [rev, costs, members, lots] = await Promise.all([
    ids.length ? ctx.supabase.from("stock_movements").select("reverses_id").in("reverses_id", ids) : Promise.resolve({ data: [] }),
    ctx.isOwner && ids.length
      ? ctx.supabase.from("stock_movement_costs").select("movement_id, total_cents").in("movement_id", ids)
      : Promise.resolve({ data: [] as { movement_id: string; total_cents: number }[] }),
    ctx.supabase.from("motel_members").select("user_id, role").eq("motel_id", ctx.motel.id),
    ctx.supabase.from("stock_lots").select("id, lot_code, expires_on").eq("motel_id", ctx.motel.id),
  ]);
  for (const r of (rev.data ?? []) as { reverses_id: string }[]) reversed.add(r.reverses_id);
  const cost = new Map((costs.data ?? []).map((c) => [c.movement_id as string, Number(c.total_cents)]));
  const roleOf = new Map((members.data ?? []).map((m) => [m.user_id as string, m.role as Role]));
  const lotOf = new Map((lots.data ?? []).map((l) => [l.id as string, l]));
  const prod = new Map(products.map((p) => [p.id, p]));
  const fmt = new Intl.DateTimeFormat("pt-BR", { timeZone: ctx.motel.timezone, dateStyle: "short", timeStyle: "short" });
  const who = (id: string | null) => {
    if (!id) return "Sistema";
    if (id === ctx.user.id) return "Você";
    const r = roleOf.get(id);
    return r === "dono" ? "Proprietário" : r === "recepcao" ? "Recepção" : r === "camareira" ? "Camareira" : "Equipe";
  };
  const route = (from: string | null, to: string | null) =>
    from && to ? `${LOCATION_LABEL[from as Location]} → ${LOCATION_LABEL[to as Location]}` : to ? `→ ${LOCATION_LABEL[to as Location]}` : from ? `${LOCATION_LABEL[from as Location]} →` : "";

  return (
    <>
      <form className="stock-filters" action={base}>
        <input type="hidden" name="aba" value="historico" />
        <select name="tipo" className="select" defaultValue={tipo} aria-label="Tipo">
          <option value="">Todos os tipos</option>
          {Object.entries(MOVEMENT_LABEL).map(([k, v]) => (
            <option key={k} value={k}>{v}</option>
          ))}
        </select>
        <select name="produto" className="select" defaultValue={produto} aria-label="Produto">
          <option value="">Todos os produtos</option>
          {products.map((p) => (
            <option key={p.id} value={p.id}>{p.name}</option>
          ))}
        </select>
        <button type="submit" className="btn-ghost">Filtrar</button>
      </form>

      {error ? (
        <p className="alert error" role="alert">Não foi possível carregar o histórico agora.</p>
      ) : (rows ?? []).length === 0 ? (
        <p className="empty">Nenhuma movimentação encontrada.</p>
      ) : (
        <>
          <p className="res-count">
            {rows!.length} lançamento{rows!.length === 1 ? "" : "s"}
            {rows!.length === 200 ? " (mostrando os 200 mais recentes)" : ""}. Lançamentos não são apagados: correções aparecem como estorno.
          </p>
          <div className="table-wrap">
            <table className="data-table stock-table">
              <thead>
                <tr>
                  <th>Quando</th>
                  <th>Tipo</th>
                  <th>Produto</th>
                  <th className="num">Qtd.</th>
                  <th>Local</th>
                  <th>Detalhes</th>
                  <th>Quem</th>
                  {ctx.isOwner && <th className="num">Custo</th>}
                  {ctx.isOwner && <th />}
                </tr>
              </thead>
              <tbody>
                {rows!.map((r) => {
                  const p = prod.get(r.product_id as string);
                  const isIn = !r.from_location && r.to_location;
                  const isOut = r.from_location && !r.to_location;
                  const lot = r.lot_id ? lotOf.get(r.lot_id as string) : null;
                  const details = [
                    r.reason as string | null,
                    r.invoice_number ? `NF ${r.invoice_number}` : null,
                    lot?.lot_code ? `lote ${lot.lot_code}` : null,
                    lot?.expires_on ? `val. ${formatDateBR(lot.expires_on as string)}` : null,
                  ].filter(Boolean).join(" · ");
                  return (
                    <tr key={r.id as string} className={reversed.has(r.id as string) ? "stock-row-reversed" : undefined}>
                      <td>{fmt.format(new Date(r.created_at as string))}</td>
                      <td>
                        <span className={`stock-type t-${r.type}`}>{MOVEMENT_LABEL[r.type as string]}</span>
                        {reversed.has(r.id as string) && <small className="stock-sub">estornado</small>}
                      </td>
                      <td>{p?.name ?? "—"}</td>
                      <td className="num">{isIn ? "+" : isOut ? "−" : ""}{formatQty(Number(r.qty), p?.unit)}</td>
                      <td>{route(r.from_location as string | null, r.to_location as string | null)}</td>
                      <td className="stock-details">{details || "—"}</td>
                      <td>{who(r.created_by as string | null)}</td>
                      {ctx.isOwner && <td className="num">{cost.has(r.id as string) ? formatCents(Math.round(cost.get(r.id as string)!)) : "—"}</td>}
                      {ctx.isOwner && (
                        <td>
                          {r.type !== "estorno" && !reversed.has(r.id as string) && (
                            <ReverseButton motelId={ctx.motel.id} movementId={r.id as string} />
                          )}
                        </td>
                      )}
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </>
      )}
    </>
  );
}

// ---------------------------------------------------------------------
// CONSUMO (relatorio simples; valores so para o dono)
// ---------------------------------------------------------------------
async function Consumo({ ctx, products, categories, sp, base }: { ctx: Ctx; products: Product[]; categories: Category[]; sp: Search; base: string }) {
  const days = [7, 30, 90].includes(Number(sp.dias)) ? Number(sp.dias) : 30;
  const today = todayIn(ctx.motel.timezone);
  const since = addDays(today, -(days - 1));
  const sinceIso = startOfDayIso(since, ctx.motel.timezone);

  const { data: rows, error } = await ctx.supabase
    .from("stock_movements")
    .select("id, product_id, type, qty, reverses_id")
    .eq("motel_id", ctx.motel.id)
    .in("type", [...EXIT_TYPES, "estorno"])
    .gte("created_at", sinceIso)
    .limit(5000);

  // estornos: descontam o lancamento original (se for uma saida)
  const revIds = (rows ?? []).filter((r) => r.type === "estorno" && r.reverses_id).map((r) => r.reverses_id as string);
  const { data: originals } = revIds.length
    ? await ctx.supabase.from("stock_movements").select("id, type").in("id", revIds)
    : { data: [] as { id: string; type: string }[] };
  const origType = new Map((originals ?? []).map((o) => [o.id as string, o.type as string]));
  const ids = (rows ?? []).map((r) => r.id as string);
  const { data: costs } =
    ctx.isOwner && ids.length
      ? await ctx.supabase.from("stock_movement_costs").select("movement_id, total_cents").in("movement_id", ids)
      : { data: [] as { movement_id: string; total_cents: number }[] };
  const cost = new Map((costs ?? []).map((c) => [c.movement_id as string, Number(c.total_cents)]));

  type Agg = { consumo: number; uso_interno: number; perdas: number; valor: number };
  const agg = new Map<string, Agg>();
  for (const r of rows ?? []) {
    const type = r.type === "estorno" ? origType.get(r.reverses_id as string) : (r.type as string);
    if (!type || !EXIT_TYPES.includes(type)) continue;
    const sign = r.type === "estorno" ? -1 : 1;
    const a = agg.get(r.product_id as string) ?? { consumo: 0, uso_interno: 0, perdas: 0, valor: 0 };
    const q = sign * Number(r.qty);
    if (type === "consumo") a.consumo += q;
    else if (type === "uso_interno") a.uso_interno += q;
    else a.perdas += q;
    a.valor += sign * (cost.get(r.id as string) ?? 0);
    agg.set(r.product_id as string, a);
  }
  const catName = new Map(categories.map((c) => [c.id, c.name]));
  const list = products
    .filter((p) => agg.has(p.id))
    .map((p) => ({ p, a: agg.get(p.id)! }))
    .filter(({ a }) => a.consumo || a.uso_interno || a.perdas)
    .sort((x, y) => y.a.consumo + y.a.uso_interno - (x.a.consumo + x.a.uso_interno));
  const totalValor = list.reduce((s, x) => s + x.a.valor, 0);

  return (
    <>
      <div className="res-toolbar">
        <nav className="segmented-links" aria-label="Período">
          {[7, 30, 90].map((d) => (
            <Link key={d} href={`${base}?aba=consumo&dias=${d}`} aria-current={d === days ? "page" : undefined}>
              {d} dias
            </Link>
          ))}
        </nav>
        {ctx.isOwner && list.length > 0 && (
          <p className="stock-value">Custo das saídas no período: <strong>{formatCents(Math.round(totalValor))}</strong></p>
        )}
      </div>
      {error ? (
        <p className="alert error" role="alert">Não foi possível carregar o relatório agora.</p>
      ) : list.length === 0 ? (
        <p className="empty">Nenhuma saída registrada nos últimos {days} dias.</p>
      ) : (
        <div className="table-wrap">
          <table className="data-table stock-table">
            <thead>
              <tr>
                <th>Produto</th>
                <th className="num">Consumo</th>
                <th className="num">Uso interno</th>
                <th className="num">Perdas, avarias e vencidos</th>
                {ctx.isOwner && <th className="num">Custo</th>}
              </tr>
            </thead>
            <tbody>
              {list.map(({ p, a }) => (
                <tr key={p.id}>
                  <td>
                    <strong>{p.name}</strong>
                    <small className="stock-sub">{catName.get(p.categoryId)}</small>
                  </td>
                  <td className="num">{a.consumo ? formatQty(a.consumo, p.unit) : "—"}</td>
                  <td className="num">{a.uso_interno ? formatQty(a.uso_interno, p.unit) : "—"}</td>
                  <td className={`num ${a.perdas ? "neg" : ""}`}>{a.perdas ? formatQty(a.perdas, p.unit) : "—"}</td>
                  {ctx.isOwner && <td className="num">{a.valor ? formatCents(Math.round(a.valor)) : "—"}</td>}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      <p className="res-hint">Saídas registradas desde {formatDateBR(since)}, já descontando os estornos.</p>
    </>
  );
}

// ---------------------------------------------------------------------
// CADASTROS (so o dono)
// ---------------------------------------------------------------------
async function Cadastros({ ctx, products, categories }: { ctx: Ctx; products: Product[]; categories: Category[] }) {
  const { data: sup } = await ctx.supabase
    .from("suppliers")
    .select("id, name, document, phone, email, notes, active")
    .eq("motel_id", ctx.motel.id)
    .order("name");
  const suppliers = (sup ?? []) as Supplier[];
  const catName = new Map(categories.map((c) => [c.id, c.name]));
  const sorted = [...products].sort((a, b) => Number(b.active) - Number(a.active) || a.name.localeCompare(b.name, "pt-BR"));

  return (
    <div className="stock-cadastros">
      <section>
        <div className="panel-box-head">
          <h3 className="section-title">Produtos ({products.length})</h3>
          <NewProduct motelId={ctx.motel.id} categories={categories} />
        </div>
        {sorted.length === 0 ? (
          <p className="empty small">Nenhum produto cadastrado.</p>
        ) : (
          <ul className="stock-rows">
            {sorted.map((p) => (
              <ProductRow key={p.id} motelId={ctx.motel.id} product={p} categories={categories} categoryName={catName.get(p.categoryId) ?? ""} />
            ))}
          </ul>
        )}
      </section>

      <section>
        <h3 className="section-title">Categorias</h3>
        <CategoryManager motelId={ctx.motel.id} categories={categories} />
      </section>

      <section>
        <div className="panel-box-head">
          <h3 className="section-title">Fornecedores ({suppliers.length})</h3>
          <NewSupplier motelId={ctx.motel.id} />
        </div>
        {suppliers.length === 0 ? (
          <p className="empty small">Nenhum fornecedor cadastrado.</p>
        ) : (
          <ul className="stock-rows">
            {suppliers.map((s) => (
              <SupplierRow key={s.id} motelId={ctx.motel.id} supplier={s} />
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}
