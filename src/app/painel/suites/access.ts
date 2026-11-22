import "server-only";
import { createClient } from "@/lib/supabase/server";

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export function isUuid(value: unknown): value is string {
  return typeof value === "string" && UUID_RE.test(value);
}

// Descobre, NO BANCO, se a pessoa logada e membro ATIVO do motel e com
// qual perfil. A regra members_select deixa cada um ler a propria linha.
// Devolve null se ela nao tiver acesso ao motel.
export async function getMembership(motelId: string) {
  if (!isUuid(motelId)) return null;
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return null;

  const { data } = await supabase
    .from("motel_members")
    .select("role")
    .eq("motel_id", motelId)
    .eq("user_id", user.id)
    .eq("active", true)
    .maybeSingle();
  if (!data) return null;

  return { supabase, userId: user.id, role: data.role as string, isOwner: data.role === "dono" };
}
