"use server";

import { revalidatePath } from "next/cache";
import { can, requireMotel } from "@/lib/motel-access";
import { parseReais } from "@/lib/periods";
import { parseQty } from "@/lib/stock";
import { MSG_ERRO, MSG_SEM_PERMISSAO, friendlyDbError } from "@/lib/action-errors";

// Conta da hospedagem (05_operacao.sql): lancar consumo (dono e recepcao) e
// estornar (so dono). As funcoes do banco conferem o perfil de novo, baixam
// o estoque e ignoram pedidos repetidos (chave "key").
export type BillState = { error?: string; success?: string; savedAt?: number } | undefined;
const MSG_SEM_SQL = "A conta da hospedagem ainda não foi ativada no banco. Rode o arquivo supabase/05_operacao.sql.";
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const text = (fd: FormData, f: string, max = 200) => {
  const v = fd.get(f);
  return typeof v === "string" ? v.trim().slice(0, max) : "";
};

export async function addCharge(_p: BillState, fd: FormData): Promise<BillState> {
  const ctx = await requireMotel(text(fd, "motelId", 40));
  if (!ctx || !can(ctx.role).reservations) return { error: MSG_SEM_PERMISSAO };
  const key = text(fd, "key", 40);
  const reservation = text(fd, "reservationId", 40);
  const productId = text(fd, "productId", 40);
  const qty = parseQty(text(fd, "qty", 10));
  if (!UUID_RE.test(key) || !UUID_RE.test(reservation)) return { error: MSG_ERRO };
  if (qty === null) return { error: "Quantidade inválida." };

  let args: Record<string, unknown>;
  if (productId) {
    if (!UUID_RE.test(productId)) return { error: "Escolha o item." };
    args = { p_product: productId, p_description: null, p_unit_price_cents: null };
  } else {
    const description = text(fd, "description", 120);
    const price = parseReais(text(fd, "price", 20));
    if (description.length < 2) return { error: "Descreva o item." };
    if (price === undefined || price === null) return { error: "Informe o preço. Use, por exemplo, 25,00." };
    args = { p_product: null, p_description: description, p_unit_price_cents: price };
  }
  const { error } = await ctx.supabase.rpc("reservation_charge_add", {
    p_motel: ctx.motel.id,
    p_key: key,
    p_reservation: reservation,
    p_qty: qty,
    ...args,
  });
  if (error) return { error: friendlyDbError(error, MSG_SEM_SQL) };
  revalidatePath(`/painel/${ctx.motel.id}`, "layout");
  return { success: "Lançado na conta.", savedAt: Date.now() };
}

export async function reverseCharge(_p: BillState, fd: FormData): Promise<BillState> {
  const ctx = await requireMotel(text(fd, "motelId", 40));
  if (!ctx?.isOwner) return { error: MSG_SEM_PERMISSAO };
  const key = text(fd, "key", 40);
  const charge = text(fd, "chargeId", 40);
  const reason = text(fd, "reason", 300);
  if (!UUID_RE.test(key) || !UUID_RE.test(charge)) return { error: MSG_ERRO };
  if (reason.length < 3) return { error: "Informe o motivo do estorno." };
  const { error } = await ctx.supabase.rpc("reservation_charge_reverse", {
    p_motel: ctx.motel.id,
    p_key: key,
    p_charge: charge,
    p_reason: reason,
  });
  if (error) return { error: friendlyDbError(error, MSG_SEM_SQL) };
  revalidatePath(`/painel/${ctx.motel.id}`, "layout");
  return { success: "Estorno lançado. O item voltou ao estoque.", savedAt: Date.now() };
}

// ---------- PAGAMENTOS (06_turnos_caixa.sql) ----------
const MSG_SEM_SQL_06 = "O caixa ainda não foi ativado no banco. Rode o arquivo supabase/06_turnos_caixa.sql.";
const METHODS = ["dinheiro", "pix", "credito", "debito"] as const;

function readParts(fd: FormData) {
  const parts: { method: string; amount_cents: number }[] = [];
  for (const m of METHODS) {
    const v = parseReais(text(fd, `pay_${m}`, 20));
    if (v === null) return { error: "Valor inválido. Use, por exemplo, 50,00." } as const;
    if (v) parts.push({ method: m, amount_cents: v });
  }
  return { parts } as const;
}

/** Registrar saida com pagamento (dono e recepcao). */
export async function checkoutWithPayment(_p: BillState, fd: FormData): Promise<BillState> {
  const ctx = await requireMotel(text(fd, "motelId", 40));
  if (!ctx || !can(ctx.role).reservations) return { error: MSG_SEM_PERMISSAO };
  const key = text(fd, "key", 40);
  const reservation = text(fd, "reservationId", 40);
  if (!UUID_RE.test(key) || !UUID_RE.test(reservation)) return { error: MSG_ERRO };
  const r = readParts(fd);
  if ("error" in r) return { error: r.error };
  const { error } = await ctx.supabase.rpc("reservation_checkout", {
    p_motel: ctx.motel.id,
    p_key: key,
    p_reservation: reservation,
    p_parts: r.parts,
  });
  if (error) return { error: friendlyDbError(error, MSG_SEM_SQL_06) };
  revalidatePath(`/painel/${ctx.motel.id}`, "layout");
  return { success: "Saída registrada e pagamento recebido. A suíte foi para a limpeza.", savedAt: Date.now() };
}

/** Receber saldo (ex.: consumo informado depois da saida). */
export async function receivePayment(_p: BillState, fd: FormData): Promise<BillState> {
  const ctx = await requireMotel(text(fd, "motelId", 40));
  if (!ctx || !can(ctx.role).reservations) return { error: MSG_SEM_PERMISSAO };
  const key = text(fd, "key", 40);
  const reservation = text(fd, "reservationId", 40);
  if (!UUID_RE.test(key) || !UUID_RE.test(reservation)) return { error: MSG_ERRO };
  const r = readParts(fd);
  if ("error" in r) return { error: r.error };
  if (r.parts.length === 0) return { error: "Informe quanto foi recebido." };
  const { error } = await ctx.supabase.rpc("payment_register", {
    p_motel: ctx.motel.id,
    p_key: key,
    p_reservation: reservation,
    p_parts: r.parts,
  });
  if (error) return { error: friendlyDbError(error, MSG_SEM_SQL_06) };
  revalidatePath(`/painel/${ctx.motel.id}`, "layout");
  return { success: "Pagamento recebido.", savedAt: Date.now() };
}

/** Estornar pagamento (so dono). */
export async function reversePayment(_p: BillState, fd: FormData): Promise<BillState> {
  const ctx = await requireMotel(text(fd, "motelId", 40));
  if (!ctx?.isOwner) return { error: MSG_SEM_PERMISSAO };
  const key = text(fd, "key", 40);
  const payment = text(fd, "paymentId", 40);
  const reason = text(fd, "reason", 300);
  if (!UUID_RE.test(key) || !UUID_RE.test(payment)) return { error: MSG_ERRO };
  if (reason.length < 3) return { error: "Informe o motivo do estorno." };
  const { error } = await ctx.supabase.rpc("payment_reverse", { p_motel: ctx.motel.id, p_key: key, p_payment: payment, p_reason: reason });
  if (error) return { error: friendlyDbError(error, MSG_SEM_SQL_06) };
  revalidatePath(`/painel/${ctx.motel.id}`, "layout");
  return { success: "Pagamento estornado.", savedAt: Date.now() };
}
