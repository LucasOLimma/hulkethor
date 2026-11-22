"use server";

import { revalidatePath } from "next/cache";
import { requireMotel } from "@/lib/motel-access";
import { PHOTO_BUCKET } from "@/lib/suite-photos";
import { MSG_ERRO, MSG_SEM_PERMISSAO, friendlyDbError } from "@/lib/action-errors";

// Fotos das suites (07_portal_cliente.sql). O arquivo e enviado pelo
// navegador direto ao Storage (com a sessao do dono; a regra do Storage so
// deixa o dono gravar na pasta do proprio motel). Aqui so registramos,
// apagamos e escolhemos a capa. So o dono.
export type PhotoState = { error?: string; success?: string; savedAt?: number } | undefined;
const MSG_SEM_SQL = "As fotos ainda não foram ativadas no banco. Rode o arquivo supabase/07_portal_cliente.sql.";
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const text = (fd: FormData, f: string, max = 200) => {
  const v = fd.get(f);
  return typeof v === "string" ? v.trim().slice(0, max) : "";
};
async function owner(fd: FormData) {
  const ctx = await requireMotel(text(fd, "motelId", 40));
  return ctx?.isOwner ? ctx : null;
}
function done(motelId: string, success: string): PhotoState {
  revalidatePath(`/painel/${motelId}`, "layout");
  return { success, savedAt: Date.now() };
}

export async function registerPhoto(_p: PhotoState, fd: FormData): Promise<PhotoState> {
  const ctx = await owner(fd);
  if (!ctx) return { error: MSG_SEM_PERMISSAO };
  const suiteId = text(fd, "suiteId", 40);
  const path = text(fd, "path", 200);
  const prefix = `${ctx.motel.id}/${suiteId}/`;
  if (!UUID_RE.test(suiteId) || !path.startsWith(prefix) || !/^[0-9a-f-]{36}\.(webp|jpg|png)$/i.test(path.slice(prefix.length))) {
    return { error: MSG_ERRO };
  }
  const { count } = await ctx.supabase.from("suite_photos").select("id", { count: "exact", head: true }).eq("suite_id", suiteId);
  const { error } = await ctx.supabase
    .from("suite_photos")
    .insert({ motel_id: ctx.motel.id, suite_id: suiteId, path, position: count ?? 0 });
  if (error) {
    // nao deixa o arquivo solto no Storage
    await ctx.supabase.storage.from(PHOTO_BUCKET).remove([path]);
    return { error: friendlyDbError(error, MSG_SEM_SQL) };
  }
  await ctx.supabase.rpc("log_audit", { p_motel: ctx.motel.id, p_action: "suite_foto_enviada", p_details: { suite_id: suiteId } });
  return done(ctx.motel.id, "Foto adicionada.");
}

export async function deletePhoto(_p: PhotoState, fd: FormData): Promise<PhotoState> {
  const ctx = await owner(fd);
  if (!ctx) return { error: MSG_SEM_PERMISSAO };
  const id = text(fd, "photoId", 40);
  if (!UUID_RE.test(id)) return { error: MSG_ERRO };
  const { data, error } = await ctx.supabase
    .from("suite_photos")
    .delete()
    .eq("id", id)
    .eq("motel_id", ctx.motel.id)
    .select("path, suite_id");
  if (error) return { error: friendlyDbError(error, MSG_SEM_SQL) };
  if (!data?.length) return { error: MSG_ERRO };
  await ctx.supabase.storage.from(PHOTO_BUCKET).remove([data[0].path as string]);
  await ctx.supabase.rpc("log_audit", { p_motel: ctx.motel.id, p_action: "suite_foto_apagada", p_details: { suite_id: data[0].suite_id } });
  return done(ctx.motel.id, "Foto apagada.");
}

export async function makeCover(_p: PhotoState, fd: FormData): Promise<PhotoState> {
  const ctx = await owner(fd);
  if (!ctx) return { error: MSG_SEM_PERMISSAO };
  const id = text(fd, "photoId", 40);
  const suiteId = text(fd, "suiteId", 40);
  if (!UUID_RE.test(id) || !UUID_RE.test(suiteId)) return { error: MSG_ERRO };
  const { data: rows } = await ctx.supabase
    .from("suite_photos")
    .select("id, position")
    .eq("suite_id", suiteId)
    .eq("motel_id", ctx.motel.id)
    .order("position");
  if (!rows?.some((r) => r.id === id)) return { error: MSG_ERRO };
  const first = Math.min(...rows.map((r) => Number(r.position)));
  const { error } = await ctx.supabase.from("suite_photos").update({ position: first - 1 }).eq("id", id).eq("motel_id", ctx.motel.id);
  if (error) return { error: friendlyDbError(error, MSG_SEM_SQL) };
  return done(ctx.motel.id, "Capa definida.");
}
