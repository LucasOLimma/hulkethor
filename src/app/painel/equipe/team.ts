import "server-only";
import { createClient } from "@/lib/supabase/server";

// Regras compartilhadas da tela de equipe (so rodam no servidor).

export const ROLES = ["dono", "recepcao", "camareira"] as const;
export type Role = (typeof ROLES)[number];

export const ROLE_LABEL: Record<Role, string> = {
  dono: "Dono",
  recepcao: "Recepção",
  camareira: "Camareira",
};

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export function isUuid(value: unknown): value is string {
  return typeof value === "string" && UUID_RE.test(value);
}

export function isRole(value: unknown): value is Role {
  return typeof value === "string" && (ROLES as readonly string[]).includes(value);
}

// Confere, NO BANCO e com a sessao da propria pessoa, se ela e dono ativo
// do motel. Usa a funcao has_role() do 01_base_multi_motel.sql.
// Devolve o cliente (chave publica) e o id do usuario, ou null se nao for dono.
export async function requireOwner(motelId: string) {
  if (!isUuid(motelId)) return null;
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return null;

  const { data: isOwner, error } = await supabase.rpc("has_role", {
    m: motelId,
    roles: ["dono"],
  });
  if (error || isOwner !== true) return null;

  return { supabase, userId: user.id };
}
