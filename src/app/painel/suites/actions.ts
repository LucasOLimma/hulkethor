"use server";

import { revalidatePath } from "next/cache";
import { PERIODS, parseReais, PERIOD_LABEL, type PricesCents } from "@/lib/periods";
import { getMembership, isUuid } from "./access";

export type SuiteState = { error?: string; success?: string; savedAt?: number } | undefined;

const MSG_SEM_PERMISSAO = "Só o dono do motel pode alterar as suítes.";
const MSG_ERRO = "Não foi possível concluir agora. Tente novamente.";

function text(formData: FormData, field: string, max = 200): string {
  const v = formData.get(field);
  return typeof v === "string" ? v.trim().slice(0, max) : "";
}

// Confere no banco se quem pediu e DONO ATIVO deste motel.
// (O banco confere de novo pela regra suites_write, por seguranca.)
async function requireOwner(motelId: string) {
  const m = await getMembership(motelId);
  return m?.isOwner ? m : null;
}

async function audit(
  supabase: NonNullable<Awaited<ReturnType<typeof requireOwner>>>["supabase"],
  motelId: string,
  action: string,
  details: Record<string, unknown>,
) {
  await supabase.rpc("log_audit", { p_motel: motelId, p_action: action, p_details: details });
}

// ---------- CRIAR ou EDITAR ----------
export async function saveSuite(_prev: SuiteState, formData: FormData): Promise<SuiteState> {
  const motelId = text(formData, "motelId");
  const suiteId = text(formData, "suiteId"); // vazio = suite nova
  const number = text(formData, "number", 20);
  const type = text(formData, "type", 60);

  if (!number) return { error: "Informe o número da suíte." };
  if (!type) return { error: "Informe o tipo da suíte." };
  if (suiteId && !isUuid(suiteId)) return { error: MSG_ERRO };

  // Precos: um campo por periodo; vazio = nao oferece esse periodo.
  const prices: PricesCents = {};
  for (const p of PERIODS) {
    const cents = parseReais(text(formData, `price_${p}`, 20));
    if (cents === null) return { error: `Preço de ${PERIOD_LABEL[p]} inválido. Use, por exemplo, 90,00.` };
    if (cents !== undefined) prices[p] = cents;
  }
  if (Object.keys(prices).length === 0) return { error: "Informe o preço de pelo menos um período." };

  // Itens: separados por virgula ou por linha. Sem repetidos.
  const items = [
    ...new Set(
      text(formData, "items", 2000)
        .split(/[,\n]/)
        .map((i) => i.trim().slice(0, 40))
        .filter(Boolean),
    ),
  ].slice(0, 30);

  const owner = await requireOwner(motelId);
  if (!owner) return { error: MSG_SEM_PERMISSAO };

  const row = { number, type, prices_cents: prices, items };
  const query = suiteId
    ? owner.supabase.from("suites").update(row).eq("id", suiteId).eq("motel_id", motelId).select("id")
    : owner.supabase.from("suites").insert({ ...row, motel_id: motelId }).select("id");
  const { data, error } = await query;

  if (error) {
    // 23505 = numero repetido (o banco nao deixa duas suites com o mesmo numero no motel)
    if (error.code === "23505") return { error: `Já existe uma suíte com o número ${number}.` };
    return { error: MSG_ERRO };
  }
  if (!data?.length) return { error: MSG_ERRO };

  await audit(owner.supabase, motelId, suiteId ? "suite_editada" : "suite_criada", {
    suite_id: data[0].id,
    number,
  });

  revalidatePath(`/painel/suites/${motelId}`);
  return { success: suiteId ? "Suíte atualizada." : `Suíte ${number} criada.`, savedAt: Date.now() };
}

// ---------- ATIVAR / DESATIVAR ----------
export async function setSuiteActive(_prev: SuiteState, formData: FormData): Promise<SuiteState> {
  const motelId = text(formData, "motelId");
  const suiteId = text(formData, "suiteId");
  const active = text(formData, "active") === "true";
  if (!isUuid(suiteId)) return { error: MSG_ERRO };

  const owner = await requireOwner(motelId);
  if (!owner) return { error: MSG_SEM_PERMISSAO };

  const { data, error } = await owner.supabase
    .from("suites")
    .update({ active })
    .eq("id", suiteId)
    .eq("motel_id", motelId)
    .select("id");
  if (error || !data?.length) return { error: MSG_ERRO };

  await audit(owner.supabase, motelId, active ? "suite_ativada" : "suite_desativada", {
    suite_id: suiteId,
  });

  revalidatePath(`/painel/suites/${motelId}`);
  return { success: active ? "Suíte ativada." : "Suíte desativada." };
}

// ---------- EXCLUIR ----------
export async function deleteSuite(_prev: SuiteState, formData: FormData): Promise<SuiteState> {
  const motelId = text(formData, "motelId");
  const suiteId = text(formData, "suiteId");
  if (!isUuid(suiteId)) return { error: MSG_ERRO };

  const owner = await requireOwner(motelId);
  if (!owner) return { error: MSG_SEM_PERMISSAO };

  const { data, error } = await owner.supabase
    .from("suites")
    .delete()
    .eq("id", suiteId)
    .eq("motel_id", motelId)
    .select("id, number");
  if (error) {
    // 23503 = a suite tem reservas (o banco protege o historico)
    if (error.code === "23503") {
      return { error: "Esta suíte tem reservas e não pode ser excluída. Desative-a." };
    }
    return { error: MSG_ERRO };
  }
  if (!data?.length) return { error: MSG_ERRO };

  await audit(owner.supabase, motelId, "suite_excluida", {
    suite_id: suiteId,
    number: data[0].number,
  });

  revalidatePath(`/painel/suites/${motelId}`);
  return { success: "Suíte excluída." };
}
