"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { requireMotel } from "@/lib/motel-access";
import { parseReais } from "@/lib/periods";
import { MSG_ERRO, MSG_SEM_PERMISSAO, friendlyDbError } from "@/lib/action-errors";

// =====================================================================
// CENTRAL DE TURNOS: acoes do servidor. Conferem o acesso ao motel e chamam
// as funcoes do banco (06_turnos_caixa.sql), que conferem o perfil de novo.
// =====================================================================

export type ShiftState = { error?: string; success?: string; savedAt?: number } | undefined;
const MSG_SEM_SQL = "A Central de Turnos ainda não foi ativada no banco. Rode o arquivo supabase/06_turnos_caixa.sql.";
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const text = (fd: FormData, f: string, max = 200) => {
  const v = fd.get(f);
  return typeof v === "string" ? v.trim().slice(0, max) : "";
};
async function desk(fd: FormData, ownerOnly = false) {
  const ctx = await requireMotel(text(fd, "motelId", 40));
  if (!ctx || ctx.role === "camareira" || (ownerOnly && !ctx.isOwner)) return null;
  return ctx;
}
const fail = (e: Parameters<typeof friendlyDbError>[0]): ShiftState => ({ error: friendlyDbError(e, MSG_SEM_SQL) });
const page = (id: string) => `/painel/${id}/turnos`;

export async function openShift(_p: ShiftState, fd: FormData): Promise<ShiftState> {
  const ctx = await desk(fd);
  if (!ctx) return { error: MSG_SEM_PERMISSAO };
  const float = parseReais(text(fd, "float", 20));
  if (float === undefined || float === null) return { error: "Informe o fundo de caixa contado (ex.: 300,00 ou 0)." };
  const checked = fd.getAll("check").filter((v): v is string => typeof v === "string" && UUID_RE.test(v)).slice(0, 100);
  const { error } = await ctx.supabase.rpc("shift_open", {
    p_motel: ctx.motel.id,
    p_float_cents: float,
    p_checked: checked,
    p_notes: text(fd, "notes", 2000) || null,
  });
  if (error) return fail(error);
  revalidatePath(`/painel/${ctx.motel.id}`, "layout");
  redirect(`${page(ctx.motel.id)}?ok=aberto`);
}

export async function closeShift(_p: ShiftState, fd: FormData): Promise<ShiftState> {
  const ctx = await desk(fd);
  if (!ctx) return { error: MSG_SEM_PERMISSAO };
  const shift = text(fd, "shiftId", 40);
  const counted = parseReais(text(fd, "counted", 20));
  if (!UUID_RE.test(shift)) return { error: MSG_ERRO };
  if (counted === undefined || counted === null) return { error: "Informe o dinheiro contado no caixa (ex.: 294,00)." };
  const { data, error } = await ctx.supabase.rpc("shift_close", {
    p_motel: ctx.motel.id,
    p_shift: shift,
    p_counted_cents: counted,
    p_handover: text(fd, "handover", 2000) || null,
  });
  if (error) return fail(error);
  revalidatePath(`/painel/${ctx.motel.id}`, "layout");
  redirect(`${page(ctx.motel.id)}?fechado=${Number(data ?? 0)}`);
}

export async function addCashMovement(_p: ShiftState, fd: FormData): Promise<ShiftState> {
  const ctx = await desk(fd);
  if (!ctx) return { error: MSG_SEM_PERMISSAO };
  const key = text(fd, "key", 40);
  const type = text(fd, "type", 20);
  const amount = parseReais(text(fd, "amount", 20));
  const reason = text(fd, "reason", 300);
  if (!UUID_RE.test(key)) return { error: MSG_ERRO };
  if (type !== "sangria" && type !== "suprimento") return { error: "Escolha sangria ou suprimento." };
  if (!amount) return { error: "Informe o valor (ex.: 100,00)." };
  if (reason.length < 3) return { error: "Informe o motivo." };
  const { error } = await ctx.supabase.rpc("cash_movement_add", {
    p_motel: ctx.motel.id,
    p_key: key,
    p_type: type,
    p_amount_cents: amount,
    p_reason: reason,
  });
  if (error) return fail(error);
  revalidatePath(`/painel/${ctx.motel.id}`, "layout");
  return { success: type === "sangria" ? "Sangria registrada." : "Suprimento registrado.", savedAt: Date.now() };
}

export async function addChecklistItem(_p: ShiftState, fd: FormData): Promise<ShiftState> {
  const ctx = await desk(fd, true);
  if (!ctx) return { error: MSG_SEM_PERMISSAO };
  const label = text(fd, "label", 120);
  if (label.length < 3) return { error: "Escreva o item." };
  const { data: last } = await ctx.supabase
    .from("shift_checklist_items")
    .select("position")
    .eq("motel_id", ctx.motel.id)
    .order("position", { ascending: false })
    .limit(1);
  const { error } = await ctx.supabase
    .from("shift_checklist_items")
    .insert({ motel_id: ctx.motel.id, label, position: Number(last?.[0]?.position ?? 0) + 1 });
  if (error) return fail(error);
  revalidatePath(page(ctx.motel.id));
  return { success: "Item adicionado.", savedAt: Date.now() };
}

export async function removeChecklistItem(_p: ShiftState, fd: FormData): Promise<ShiftState> {
  const ctx = await desk(fd, true);
  if (!ctx) return { error: MSG_SEM_PERMISSAO };
  const id = text(fd, "id", 40);
  if (!UUID_RE.test(id)) return { error: MSG_ERRO };
  // desativa (os turnos antigos guardam a lista como estava)
  const { error } = await ctx.supabase.from("shift_checklist_items").update({ active: false }).eq("id", id).eq("motel_id", ctx.motel.id);
  if (error) return fail(error);
  revalidatePath(page(ctx.motel.id));
  return { success: "Item removido da lista.", savedAt: Date.now() };
}
