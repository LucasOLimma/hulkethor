"use server";

import { requireMotel } from "@/lib/motel-access";
import type { Board } from "@/lib/board";

// Le o mapa de novo (a tela chama a cada mudanca e a cada 20 s).
// O banco confere se a pessoa e membro do motel (suite_board).
export async function loadBoard(motelId: string): Promise<Board | null> {
  const ctx = await requireMotel(motelId);
  if (!ctx) return null;
  const { data, error } = await ctx.supabase.rpc("suite_board", { p_motel: ctx.motel.id });
  if (error || !data) return null;
  return data as Board;
}
