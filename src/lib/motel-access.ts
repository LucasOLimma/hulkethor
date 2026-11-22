import "server-only";
import { cache } from "react";
import { createClient } from "@/lib/supabase/server";

// =====================================================================
// ACESSO AOS ESTABELECIMENTOS (multi-motel)
//
// Regra de ouro: o motel escolhido na tela (o ID que vem no endereço) NUNCA
// e confiado sozinho. Toda pagina do painel chama requireMotel(id), que
// confere NO BANCO, com a sessao da propria pessoa, se ela e membro ATIVO
// daquele motel (tabela motel_members). Alem disso, as regras de RLS do
// banco filtram cada consulta. `cache` evita repetir a consulta dentro da
// mesma requisicao (cada requisicao nova confere de novo).
// =====================================================================

export type Role = "dono" | "recepcao" | "camareira";

export const ROLE_LABEL: Record<Role, string> = {
  dono: "Proprietário",
  recepcao: "Recepção",
  camareira: "Camareira",
};

export type MyMotel = {
  id: string;
  name: string;
  slug: string;
  timezone: string;
  role: Role;
};

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export const getSessionUser = cache(async () => {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  return { supabase, user };
});

/** Todos os motéis em que a pessoa logada é membro ATIVO. */
export const getMyMotels = cache(async (): Promise<MyMotel[]> => {
  const { supabase, user } = await getSessionUser();
  if (!user) return [];
  const { data, error } = await supabase
    .from("motel_members")
    .select("role, motels ( id, name, slug, timezone )")
    .eq("user_id", user.id)
    .eq("active", true);
  if (error) throw new Error("Falha ao carregar estabelecimentos");

  return (data ?? [])
    .map((row) => {
      const m = (Array.isArray(row.motels) ? row.motels[0] : row.motels) as
        | { id: string; name: string; slug: string; timezone: string }
        | null;
      if (!m) return null;
      return { id: m.id, name: m.name, slug: m.slug, timezone: m.timezone, role: row.role as Role };
    })
    .filter((m): m is MyMotel => m !== null)
    .sort((a, b) => a.name.localeCompare(b.name, "pt-BR"));
});

/**
 * Confere se a pessoa logada tem acesso ao motel pedido.
 * Devolve o motel + perfil + cliente do banco, ou null (sem acesso).
 */
export const requireMotel = cache(async (motelId: string) => {
  if (!UUID_RE.test(motelId)) return null;
  const { supabase, user } = await getSessionUser();
  if (!user) return null;
  const motel = (await getMyMotels()).find((m) => m.id === motelId);
  if (!motel) return null;
  return { supabase, user, motel, role: motel.role, isOwner: motel.role === "dono" };
});

/** O que cada perfil pode ver no menu do painel. */
export function can(role: Role) {
  return {
    reservations: role === "dono" || role === "recepcao", // regra reservations_select do banco
    team: role === "dono",
    reports: role === "dono",
    settings: true,
  };
}
