"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { requireMotel } from "@/lib/motel-access";
import { parseQty } from "@/lib/stock";
import { MSG_ERRO, MSG_SEM_PERMISSAO, friendlyDbError } from "@/lib/action-errors";

// =====================================================================
// LIMPEZA: acoes do servidor. Conferem o acesso ao motel (requireMotel) e
// chamam as funcoes do banco (05_operacao.sql), que conferem o perfil de
// novo e gravam tudo numa transacao unica.
// =====================================================================

export type TaskState = { error?: string; success?: string; savedAt?: number } | undefined;

const MSG_SEM_SQL = "A limpeza ainda não foi ativada no banco. Rode o arquivo supabase/05_operacao.sql no Supabase.";
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const text = (fd: FormData, f: string, max = 200) => {
  const v = fd.get(f);
  return typeof v === "string" ? v.trim().slice(0, max) : "";
};

async function ctxFor(fd: FormData, desk = false) {
  const ctx = await requireMotel(text(fd, "motelId", 40));
  if (!ctx) return null;
  if (desk && ctx.role === "camareira") return null;
  return ctx;
}
function ok(motelId: string, success: string): TaskState {
  revalidatePath(`/painel/${motelId}`, "layout");
  return { success, savedAt: Date.now() };
}
const fail = (e: Parameters<typeof friendlyDbError>[0]): TaskState => ({ error: friendlyDbError(e, MSG_SEM_SQL) });

export async function startTask(_p: TaskState, fd: FormData): Promise<TaskState> {
  const ctx = await ctxFor(fd);
  if (!ctx) return { error: MSG_SEM_PERMISSAO };
  const task = text(fd, "taskId", 40);
  if (!UUID_RE.test(task)) return { error: MSG_ERRO };
  const { error } = await ctx.supabase.rpc("housekeeping_start", { p_motel: ctx.motel.id, p_task: task });
  if (error) return fail(error);
  return ok(ctx.motel.id, "Limpeza iniciada.");
}

export async function finishTask(_p: TaskState, fd: FormData): Promise<TaskState> {
  const ctx = await ctxFor(fd);
  if (!ctx) return { error: MSG_SEM_PERMISSAO };
  const task = text(fd, "taskId", 40);
  const key = text(fd, "key", 40);
  const condition = text(fd, "condition", 20);
  const notes = text(fd, "notes", 1000);
  if (!UUID_RE.test(task) || !UUID_RE.test(key)) return { error: MSG_ERRO };
  if (!["ok", "observacoes", "problema"].includes(condition)) return { error: "Escolha o estado da suíte." };
  if (condition !== "ok" && notes.length < 3) return { error: "Descreva a observação ou o problema." };

  const items: { product_id: string; qty: number }[] = [];
  for (const [field, value] of fd.entries()) {
    if (!field.startsWith("item_") || typeof value !== "string" || !value.trim()) continue;
    const productId = field.slice(5);
    if (!UUID_RE.test(productId)) continue;
    const qty = parseQty(value.trim().slice(0, 10), true);
    if (qty === null) return { error: "Quantidade de item inválida." };
    if (qty > 0) items.push({ product_id: productId, qty });
  }
  if (items.length > 50) return { error: MSG_ERRO };

  const { data, error } = await ctx.supabase.rpc("housekeeping_finish", {
    p_motel: ctx.motel.id,
    p_task: task,
    p_key: key,
    p_condition: condition,
    p_notes: notes || null,
    p_restock: fd.get("restock") === "on",
    p_items: items,
  });
  if (error) return fail(error);
  ok(ctx.motel.id, "");
  // o cartao da suite sai da lista: a confirmacao aparece no topo da pagina
  redirect(`/painel/${ctx.motel.id}/limpeza?ok=${data === "problema" ? "problema" : "liberada"}`);
}

export async function resolveTask(_p: TaskState, fd: FormData): Promise<TaskState> {
  const ctx = await ctxFor(fd, true);
  if (!ctx) return { error: MSG_SEM_PERMISSAO };
  const task = text(fd, "taskId", 40);
  const resolution = text(fd, "resolution", 1000);
  if (!UUID_RE.test(task)) return { error: MSG_ERRO };
  if (resolution.length < 3) return { error: "Descreva o que foi feito." };
  const { error } = await ctx.supabase.rpc("housekeeping_resolve", { p_motel: ctx.motel.id, p_task: task, p_resolution: resolution });
  if (error) return fail(error);
  ok(ctx.motel.id, "");
  redirect(`/painel/${ctx.motel.id}/limpeza?ok=resolvida`);
}

export async function cancelTask(_p: TaskState, fd: FormData): Promise<TaskState> {
  const ctx = await ctxFor(fd, true);
  if (!ctx) return { error: MSG_SEM_PERMISSAO };
  const task = text(fd, "taskId", 40);
  if (!UUID_RE.test(task)) return { error: MSG_ERRO };
  const { error } = await ctx.supabase.rpc("housekeeping_cancel", { p_motel: ctx.motel.id, p_task: task });
  if (error) return fail(error);
  return ok(ctx.motel.id, "Limpeza cancelada.");
}

export async function requestCleaning(_p: TaskState, fd: FormData): Promise<TaskState> {
  const ctx = await ctxFor(fd, true);
  if (!ctx) return { error: MSG_SEM_PERMISSAO };
  const suite = text(fd, "suiteId", 40);
  if (!UUID_RE.test(suite)) return { error: "Escolha a suíte." };
  const { error } = await ctx.supabase.rpc("housekeeping_request", {
    p_motel: ctx.motel.id,
    p_suite: suite,
    p_notes: text(fd, "notes", 1000) || null,
  });
  if (error) return fail(error);
  return ok(ctx.motel.id, "Limpeza pedida. A camareira já vê a suíte na lista.");
}
