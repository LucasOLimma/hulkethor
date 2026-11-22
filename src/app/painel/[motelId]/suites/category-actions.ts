"use server";

import { revalidatePath } from "next/cache";
import { requireMotel } from "@/lib/motel-access";
import { parseQty } from "@/lib/stock";
import { MSG_ERRO, MSG_SEM_PERMISSAO, friendlyDbError } from "@/lib/action-errors";

// Categorias de suite e kit padrao (05_operacao.sql). So o dono altera
// (conferido aqui e pelas regras RLS do banco).
export type CatState = { error?: string; success?: string; savedAt?: number } | undefined;
const MSG_SEM_SQL = "As categorias de suíte ainda não foram ativadas no banco. Rode o arquivo supabase/05_operacao.sql.";
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const text = (fd: FormData, f: string, max = 200) => {
  const v = fd.get(f);
  return typeof v === "string" ? v.trim().slice(0, max) : "";
};
async function owner(fd: FormData) {
  const ctx = await requireMotel(text(fd, "motelId", 40));
  return ctx?.isOwner ? ctx : null;
}
function ok(motelId: string, success: string): CatState {
  revalidatePath(`/painel/${motelId}`, "layout");
  return { success, savedAt: Date.now() };
}

export async function saveSuiteCategory(_p: CatState, fd: FormData): Promise<CatState> {
  const ctx = await owner(fd);
  if (!ctx) return { error: MSG_SEM_PERMISSAO };
  const id = text(fd, "id", 40);
  const name = text(fd, "name", 60);
  if (name.length < 2) return { error: "Informe o nome da categoria." };
  if (id && !UUID_RE.test(id)) return { error: MSG_ERRO };
  const { error } = id
    ? await ctx.supabase.from("suite_categories").update({ name }).eq("id", id).eq("motel_id", ctx.motel.id)
    : await ctx.supabase.from("suite_categories").insert({ motel_id: ctx.motel.id, name });
  if (error?.code === "23505") return { error: "Já existe uma categoria com esse nome." };
  if (error) return { error: friendlyDbError(error, MSG_SEM_SQL) };
  return ok(ctx.motel.id, id ? "Categoria renomeada." : "Categoria criada.");
}

export async function deleteSuiteCategory(_p: CatState, fd: FormData): Promise<CatState> {
  const ctx = await owner(fd);
  if (!ctx) return { error: MSG_SEM_PERMISSAO };
  const id = text(fd, "id", 40);
  if (!UUID_RE.test(id)) return { error: MSG_ERRO };
  // as suites da categoria ficam sem categoria (o banco faz isso sozinho)
  const { error } = await ctx.supabase.from("suite_categories").delete().eq("id", id).eq("motel_id", ctx.motel.id);
  if (error) return { error: friendlyDbError(error, MSG_SEM_SQL) };
  return ok(ctx.motel.id, "Categoria excluída.");
}

export async function setKitItem(_p: CatState, fd: FormData): Promise<CatState> {
  const ctx = await owner(fd);
  if (!ctx) return { error: MSG_SEM_PERMISSAO };
  const categoryId = text(fd, "categoryId", 40);
  const productId = text(fd, "productId", 40);
  const qty = parseQty(text(fd, "qty", 10));
  if (!UUID_RE.test(categoryId)) return { error: MSG_ERRO };
  if (!UUID_RE.test(productId)) return { error: "Escolha o produto." };
  if (qty === null) return { error: "Quantidade inválida." };
  // troca a quantidade se o item ja estiver no kit
  const del = await ctx.supabase
    .from("suite_category_kits")
    .delete()
    .eq("category_id", categoryId)
    .eq("product_id", productId)
    .eq("motel_id", ctx.motel.id);
  if (del.error) return { error: friendlyDbError(del.error, MSG_SEM_SQL) };
  const { error } = await ctx.supabase
    .from("suite_category_kits")
    .insert({ category_id: categoryId, product_id: productId, motel_id: ctx.motel.id, qty });
  if (error?.code === "23503") return { error: "Produto ou categoria não encontrados." };
  if (error) return { error: friendlyDbError(error, MSG_SEM_SQL) };
  return ok(ctx.motel.id, "Kit atualizado.");
}

export async function removeKitItem(_p: CatState, fd: FormData): Promise<CatState> {
  const ctx = await owner(fd);
  if (!ctx) return { error: MSG_SEM_PERMISSAO };
  const categoryId = text(fd, "categoryId", 40);
  const productId = text(fd, "productId", 40);
  if (!UUID_RE.test(categoryId) || !UUID_RE.test(productId)) return { error: MSG_ERRO };
  const { error } = await ctx.supabase
    .from("suite_category_kits")
    .delete()
    .eq("category_id", categoryId)
    .eq("product_id", productId)
    .eq("motel_id", ctx.motel.id);
  if (error) return { error: friendlyDbError(error, MSG_SEM_SQL) };
  return ok(ctx.motel.id, "Item removido do kit.");
}
