"use server";

import { revalidatePath } from "next/cache";
import { requireMotel } from "@/lib/motel-access";
import { MSG_SEM_PERMISSAO, friendlyDbError } from "@/lib/action-errors";

export type SettingsState = { error?: string; success?: string } | undefined;

// Prazo de cancelamento pelo cliente (07_portal_cliente.sql). So o dono
// (conferido aqui e pela regra settings_update do banco).
export async function saveCancelHours(_p: SettingsState, fd: FormData): Promise<SettingsState> {
  const motelId = fd.get("motelId");
  const ctx = typeof motelId === "string" ? await requireMotel(motelId) : null;
  if (!ctx?.isOwner) return { error: MSG_SEM_PERMISSAO };
  const raw = String(fd.get("hours") ?? "").trim();
  if (!/^\d{1,2}$/.test(raw) || Number(raw) > 72) return { error: "Use um número de horas entre 0 e 72." };
  const hours = Number(raw);
  const { error } = await ctx.supabase.from("motel_settings").update({ client_cancel_hours: hours }).eq("motel_id", ctx.motel.id);
  if (error) return { error: friendlyDbError(error, "Rode o arquivo supabase/07_portal_cliente.sql para ativar esta configuração.") };
  await ctx.supabase.rpc("log_audit", { p_motel: ctx.motel.id, p_action: "config_cancelamento", p_details: { horas: hours } });
  revalidatePath(`/painel/${ctx.motel.id}/configuracoes`);
  return { success: hours === 0 ? "Salvo: o cliente pode cancelar até o horário da chegada." : `Salvo: o cliente pode cancelar até ${hours} h antes da chegada.` };
}
