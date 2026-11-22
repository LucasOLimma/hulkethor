"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { requireMotel } from "@/lib/motel-access";
import { parseReais } from "@/lib/periods";
import { DESK_EXITS, LOCATIONS, OWNER_EXITS, UNITS, isMissingTable, parseQty, type Location } from "@/lib/stock";

// =====================================================================
// ESTOQUE: acoes do servidor.
// Cada acao confere NO BANCO (requireMotel) se a pessoa e membro ativo do
// motel e com qual perfil. As movimentacoes passam SEMPRE pelas funcoes do
// banco (04_estoque.sql), que conferem o perfil de novo, gravam tudo numa
// transacao unica e ignoram pedidos repetidos (chave anti-duplicidade).
// =====================================================================

export type StockState = { error?: string; success?: string; savedAt?: number } | undefined;

const MSG_SEM_PERMISSAO = "Você não tem permissão para esta ação no estoque.";
const MSG_ERRO = "Não foi possível concluir agora. Tente novamente.";
const MSG_SEM_SQL = "O estoque ainda não foi ativado no banco. Rode o arquivo supabase/04_estoque.sql no Supabase.";
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const isUuid = (v: string) => UUID_RE.test(v);

function text(fd: FormData, field: string, max = 200) {
  const v = fd.get(field);
  return typeof v === "string" ? v.trim().slice(0, max) : "";
}

type Need = "owner" | "desk";
async function ctxFor(fd: FormData, need: Need) {
  const motelId = text(fd, "motelId", 40);
  const ctx = await requireMotel(motelId);
  if (!ctx) return null;
  if (need === "owner" && ctx.role !== "dono") return null;
  if (need === "desk" && ctx.role === "camareira") return null;
  return ctx;
}

function done(motelId: string, success: string): StockState {
  // "layout": atualiza tambem o sininho de alertas
  revalidatePath(`/painel/${motelId}`, "layout");
  return { success, savedAt: Date.now() };
}

/** Mensagem segura para o erro do banco (so repassa as mensagens do proprio estoque). */
function dbError(e: { code?: string; message?: string; hint?: string } | null): StockState {
  if (!e) return { error: MSG_ERRO };
  if (e.hint === "estoque" && e.message) return { error: e.message };
  if (isMissingTable(e)) return { error: MSG_SEM_SQL };
  if (e.message?.includes("Sem permissao") || e.code === "42501") return { error: MSG_SEM_PERMISSAO };
  return { error: MSG_ERRO };
}

// ---------------------------------------------------------------------
// CADASTROS (so o dono)
// ---------------------------------------------------------------------

export async function saveCategory(_p: StockState, fd: FormData): Promise<StockState> {
  const ctx = await ctxFor(fd, "owner");
  if (!ctx) return { error: MSG_SEM_PERMISSAO };
  const id = text(fd, "id", 40);
  const name = text(fd, "name", 60);
  if (name.length < 2) return { error: "Informe o nome da categoria." };
  if (id && !isUuid(id)) return { error: MSG_ERRO };

  const { error } = id
    ? await ctx.supabase.from("stock_categories").update({ name }).eq("id", id).eq("motel_id", ctx.motel.id)
    : await ctx.supabase.from("stock_categories").insert({ motel_id: ctx.motel.id, name });
  if (error?.code === "23505") return { error: "Já existe uma categoria com esse nome." };
  if (error) return dbError(error);
  return done(ctx.motel.id, id ? "Categoria renomeada." : "Categoria criada.");
}

export async function deleteCategory(_p: StockState, fd: FormData): Promise<StockState> {
  const ctx = await ctxFor(fd, "owner");
  if (!ctx) return { error: MSG_SEM_PERMISSAO };
  const id = text(fd, "id", 40);
  if (!isUuid(id)) return { error: MSG_ERRO };
  const { error } = await ctx.supabase.from("stock_categories").delete().eq("id", id).eq("motel_id", ctx.motel.id);
  if (error?.code === "23503") return { error: "Esta categoria tem produtos. Mova os produtos para outra categoria antes de excluir." };
  if (error) return dbError(error);
  return done(ctx.motel.id, "Categoria excluída.");
}

export async function saveSupplier(_p: StockState, fd: FormData): Promise<StockState> {
  const ctx = await ctxFor(fd, "owner");
  if (!ctx) return { error: MSG_SEM_PERMISSAO };
  const id = text(fd, "id", 40);
  if (id && !isUuid(id)) return { error: MSG_ERRO };
  const row = {
    name: text(fd, "name", 120),
    document: text(fd, "document", 30) || null,
    phone: text(fd, "phone", 30) || null,
    email: text(fd, "email", 120) || null,
    notes: text(fd, "notes", 500) || null,
  };
  if (row.name.length < 2) return { error: "Informe o nome do fornecedor." };

  const { error } = id
    ? await ctx.supabase.from("suppliers").update(row).eq("id", id).eq("motel_id", ctx.motel.id)
    : await ctx.supabase.from("suppliers").insert({ ...row, motel_id: ctx.motel.id });
  if (error?.code === "23505") return { error: "Já existe um fornecedor com esse nome." };
  if (error) return dbError(error);
  return done(ctx.motel.id, id ? "Fornecedor atualizado." : "Fornecedor cadastrado.");
}

export async function setSupplierActive(_p: StockState, fd: FormData): Promise<StockState> {
  const ctx = await ctxFor(fd, "owner");
  if (!ctx) return { error: MSG_SEM_PERMISSAO };
  const id = text(fd, "id", 40);
  if (!isUuid(id)) return { error: MSG_ERRO };
  const active = text(fd, "active") === "true";
  const { error } = await ctx.supabase.from("suppliers").update({ active }).eq("id", id).eq("motel_id", ctx.motel.id);
  if (error) return dbError(error);
  return done(ctx.motel.id, active ? "Fornecedor reativado." : "Fornecedor desativado.");
}

export async function saveProduct(_p: StockState, fd: FormData): Promise<StockState> {
  const ctx = await ctxFor(fd, "owner");
  if (!ctx) return { error: MSG_SEM_PERMISSAO };
  const id = text(fd, "id", 40);
  if (id && !isUuid(id)) return { error: MSG_ERRO };

  const name = text(fd, "name", 120);
  const categoryId = text(fd, "categoryId", 40);
  const unit = text(fd, "unit", 5);
  const kind = text(fd, "kind", 10);
  const minRaw = text(fd, "minQty", 15);
  const minQty = minRaw ? parseQty(minRaw, true) : 0;
  const sale = parseReais(text(fd, "salePrice", 20));
  const tracksExpiry = kind === "consumo" && fd.get("tracksExpiry") === "on";

  if (name.length < 2) return { error: "Informe o nome do produto." };
  if (!isUuid(categoryId)) return { error: "Escolha a categoria." };
  if (!(UNITS as readonly string[]).includes(unit)) return { error: "Escolha a unidade." };
  if (kind !== "consumo" && kind !== "enxoval") return { error: "Escolha o tipo do produto." };
  if (minQty === null) return { error: "Estoque mínimo inválido. Use, por exemplo, 10 ou 2,5." };
  if (sale === null) return { error: "Preço de venda inválido. Use, por exemplo, 8,00." };

  const row = {
    name,
    category_id: categoryId,
    unit,
    kind,
    min_qty: minQty,
    tracks_expiry: tracksExpiry,
    sale_price_cents: sale ?? null,
    sku: text(fd, "sku", 40) || null,
  };
  const { error } = id
    ? await ctx.supabase.from("products").update(row).eq("id", id).eq("motel_id", ctx.motel.id)
    : await ctx.supabase.from("products").insert({ ...row, motel_id: ctx.motel.id });
  if (error?.code === "23505") return { error: "Já existe um produto com esse nome." };
  if (error?.code === "23503") return { error: "Categoria não encontrada." };
  if (error) return dbError(error);
  return done(ctx.motel.id, id ? "Produto atualizado." : "Produto cadastrado.");
}

export async function setProductActive(_p: StockState, fd: FormData): Promise<StockState> {
  const ctx = await ctxFor(fd, "owner");
  if (!ctx) return { error: MSG_SEM_PERMISSAO };
  const id = text(fd, "id", 40);
  if (!isUuid(id)) return { error: MSG_ERRO };
  const active = text(fd, "active") === "true";
  const { error } = await ctx.supabase.from("products").update({ active }).eq("id", id).eq("motel_id", ctx.motel.id);
  if (error) return dbError(error);
  return done(ctx.motel.id, active ? "Produto reativado." : "Produto desativado.");
}

// ---------------------------------------------------------------------
// MOVIMENTACOES (funcoes do banco; "key" = chave anti-duplicidade gerada no navegador)
// ---------------------------------------------------------------------

function readKey(fd: FormData) {
  const key = text(fd, "key", 40);
  return isUuid(key) ? key : null;
}

export async function registerEntry(_p: StockState, fd: FormData): Promise<StockState> {
  const ctx = await ctxFor(fd, "owner");
  if (!ctx) return { error: MSG_SEM_PERMISSAO };
  const key = readKey(fd);
  const productId = text(fd, "productId", 40);
  const qty = parseQty(text(fd, "qty", 15));
  const cost = parseReais(text(fd, "unitCost", 20));
  const supplierId = text(fd, "supplierId", 40);
  const expires = text(fd, "expiresOn", 10);

  if (!key) return { error: MSG_ERRO };
  if (!isUuid(productId)) return { error: "Escolha o produto." };
  if (qty === null) return { error: "Quantidade inválida. Use, por exemplo, 24 ou 1,5." };
  if (cost === undefined) return { error: "Informe o custo unitário (pode ser 0,00)." };
  if (cost === null) return { error: "Custo inválido. Use, por exemplo, 2,50." };
  if (supplierId && !isUuid(supplierId)) return { error: "Fornecedor inválido." };
  if (expires && !/^\d{4}-\d{2}-\d{2}$/.test(expires)) return { error: "Data de validade inválida." };

  const { error } = await ctx.supabase.rpc("stock_entry", {
    p_motel: ctx.motel.id,
    p_key: key,
    p_product: productId,
    p_qty: qty,
    p_unit_cost_cents: cost,
    p_supplier: supplierId || null,
    p_lot_code: text(fd, "lotCode", 40) || null,
    p_expires_on: expires || null,
    p_invoice: text(fd, "invoice", 60) || null,
    p_notes: text(fd, "notes", 500) || null,
  });
  if (error) return dbError(error);
  return done(ctx.motel.id, "Entrada registrada.");
}

export async function registerExit(_p: StockState, fd: FormData): Promise<StockState> {
  const type = text(fd, "type", 20);
  const ownerOnly = (OWNER_EXITS as readonly string[]).includes(type);
  if (!ownerOnly && !(DESK_EXITS as readonly string[]).includes(type)) return { error: "Escolha o tipo de saída." };
  const ctx = await ctxFor(fd, ownerOnly ? "owner" : "desk");
  if (!ctx) return { error: MSG_SEM_PERMISSAO };

  const key = readKey(fd);
  const productId = text(fd, "productId", 40);
  const qty = parseQty(text(fd, "qty", 15));
  const location = (text(fd, "location", 12) || "estoque") as Location;
  const reason = text(fd, "reason", 500);
  if (!key) return { error: MSG_ERRO };
  if (!isUuid(productId)) return { error: "Escolha o produto." };
  if (qty === null) return { error: "Quantidade inválida. Use, por exemplo, 2 ou 0,5." };
  if (!LOCATIONS.includes(location)) return { error: "Local inválido." };
  if (ownerOnly && reason.length < 3) return { error: "Informe o motivo." };

  const { error } = await ctx.supabase.rpc("stock_exit", {
    p_motel: ctx.motel.id,
    p_key: key,
    p_product: productId,
    p_type: type,
    p_qty: qty,
    p_location: location,
    p_lot: null,
    p_reason: reason || null,
  });
  if (error) return dbError(error);
  return done(ctx.motel.id, "Saída registrada.");
}

export async function registerTransfer(_p: StockState, fd: FormData): Promise<StockState> {
  const ctx = await ctxFor(fd, "desk");
  if (!ctx) return { error: MSG_SEM_PERMISSAO };
  const key = readKey(fd);
  const productId = text(fd, "productId", 40);
  const qty = parseQty(text(fd, "qty", 15));
  const from = text(fd, "from", 12) as Location;
  const to = text(fd, "to", 12) as Location;
  if (!key) return { error: MSG_ERRO };
  if (!isUuid(productId)) return { error: "Escolha o item de enxoval." };
  if (qty === null) return { error: "Quantidade inválida." };
  if (!LOCATIONS.includes(from) || !LOCATIONS.includes(to) || from === to) {
    return { error: "Escolha a origem e o destino (diferentes)." };
  }
  const { error } = await ctx.supabase.rpc("stock_transfer", {
    p_motel: ctx.motel.id,
    p_key: key,
    p_product: productId,
    p_qty: qty,
    p_from: from,
    p_to: to,
    p_notes: text(fd, "notes", 500) || null,
  });
  if (error) return dbError(error);
  return done(ctx.motel.id, "Movimentação do enxoval registrada.");
}

export async function reverseMovement(_p: StockState, fd: FormData): Promise<StockState> {
  const ctx = await ctxFor(fd, "owner");
  if (!ctx) return { error: MSG_SEM_PERMISSAO };
  const key = readKey(fd);
  const movementId = text(fd, "movementId", 40);
  const reason = text(fd, "reason", 500);
  if (!key || !isUuid(movementId)) return { error: MSG_ERRO };
  if (reason.length < 3) return { error: "Informe o motivo do estorno." };
  const { error } = await ctx.supabase.rpc("stock_reverse", {
    p_motel: ctx.motel.id,
    p_key: key,
    p_movement: movementId,
    p_reason: reason,
  });
  if (error) return dbError(error);
  return done(ctx.motel.id, "Estorno registrado. O lançamento original continua no histórico.");
}

// ---------------------------------------------------------------------
// CONFERENCIA (inventario): dono e recepcao contam; so o dono fecha
// ---------------------------------------------------------------------

export async function openInventory(_p: StockState, fd: FormData): Promise<StockState> {
  const ctx = await ctxFor(fd, "desk");
  if (!ctx) return { error: MSG_SEM_PERMISSAO };
  const location = text(fd, "location", 12) as Location;
  if (!LOCATIONS.includes(location)) return { error: "Escolha o local." };
  const { error } = await ctx.supabase.rpc("inventory_open", {
    p_motel: ctx.motel.id,
    p_location: location,
    p_notes: text(fd, "notes", 500) || null,
  });
  if (error) return dbError(error);
  return done(ctx.motel.id, "Conferência aberta. Conte os itens e salve.");
}

export async function saveCounts(_p: StockState, fd: FormData): Promise<StockState> {
  const ctx = await ctxFor(fd, "desk");
  if (!ctx) return { error: MSG_SEM_PERMISSAO };
  const inventoryId = text(fd, "inventoryId", 40);
  if (!isUuid(inventoryId)) return { error: MSG_ERRO };

  const counts: { productId: string; qty: number }[] = [];
  for (const [field, value] of fd.entries()) {
    if (!field.startsWith("count_") || typeof value !== "string" || !value.trim()) continue;
    const productId = field.slice(6);
    if (!isUuid(productId)) continue;
    const qty = parseQty(value.trim().slice(0, 15), true);
    if (qty === null) return { error: `Quantidade inválida: "${value.trim().slice(0, 15)}".` };
    counts.push({ productId, qty });
  }
  if (counts.length === 0) return { error: "Preencha a quantidade contada de pelo menos um item." };
  if (counts.length > 500) return { error: MSG_ERRO };

  for (const c of counts) {
    const { error } = await ctx.supabase.rpc("inventory_count", {
      p_motel: ctx.motel.id,
      p_inventory: inventoryId,
      p_product: c.productId,
      p_qty: c.qty,
    });
    if (error) return dbError(error);
  }
  return done(ctx.motel.id, `Contagem salva (${counts.length} ${counts.length === 1 ? "item" : "itens"}).`);
}

export async function closeInventory(_p: StockState, fd: FormData): Promise<StockState> {
  const ctx = await ctxFor(fd, "owner");
  if (!ctx) return { error: MSG_SEM_PERMISSAO };
  const inventoryId = text(fd, "inventoryId", 40);
  if (!isUuid(inventoryId)) return { error: MSG_ERRO };
  const { data, error } = await ctx.supabase.rpc("inventory_close", { p_motel: ctx.motel.id, p_inventory: inventoryId });
  if (error) return dbError(error);
  done(ctx.motel.id, "");
  // o quadro da conferencia some ao fechar: a confirmacao aparece na pagina
  redirect(`/painel/${ctx.motel.id}/estoque?aba=conferencia&fechada=${Number(data ?? 0)}`);
}

export async function cancelInventory(_p: StockState, fd: FormData): Promise<StockState> {
  const ctx = await ctxFor(fd, "owner");
  if (!ctx) return { error: MSG_SEM_PERMISSAO };
  const inventoryId = text(fd, "inventoryId", 40);
  if (!isUuid(inventoryId)) return { error: MSG_ERRO };
  const { error } = await ctx.supabase.rpc("inventory_cancel", { p_motel: ctx.motel.id, p_inventory: inventoryId });
  if (error) return dbError(error);
  done(ctx.motel.id, "");
  redirect(`/painel/${ctx.motel.id}/estoque?aba=conferencia&cancelada=1`);
}
