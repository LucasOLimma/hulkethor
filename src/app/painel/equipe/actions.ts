"use server";

import { revalidatePath } from "next/cache";
import { createAdminClient } from "@/lib/supabase/admin";
import { getSiteUrl } from "@/lib/supabase/env";
import { isRole, isUuid, requireOwner } from "./team";

export type TeamState = { error?: string; success?: string } | undefined;

const MSG_SEM_PERMISSAO = "Você não tem permissão para fazer isso.";
const MSG_ERRO = "Não foi possível concluir agora. Tente novamente.";
const MSG_ULTIMO_DONO = "O motel precisa ter pelo menos um dono ativo.";
const MSG_PROPRIO = "Você não pode alterar o seu próprio acesso por aqui.";

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

function text(formData: FormData, field: string, max = 200): string {
  const v = formData.get(field);
  return typeof v === "string" ? v.trim().slice(0, max) : "";
}

// O gatilho protect_last_owner do banco devolve este texto quando
// alguem tenta tirar o ultimo dono ativo.
function friendlyDbError(message: string | undefined): string {
  return message?.includes("pelo menos um dono ativo") ? MSG_ULTIMO_DONO : MSG_ERRO;
}

// ---------- CONVIDAR ----------
export async function inviteMember(_prev: TeamState, formData: FormData): Promise<TeamState> {
  const motelId = text(formData, "motelId");
  const email = text(formData, "email").toLowerCase();
  const role = text(formData, "role");

  if (!EMAIL_RE.test(email)) return { error: "Digite um e-mail válido." };
  if (!isRole(role)) return { error: "Escolha um perfil." };

  // 1) So o dono ativo deste motel pode convidar (conferido no banco).
  const owner = await requireOwner(motelId);
  if (!owner) return { error: MSG_SEM_PERMISSAO };

  // 2) Cria a conta e envia o e-mail de convite (precisa da chave secreta).
  const admin = createAdminClient();
  const { data: invited, error: inviteError } = await admin.auth.admin.inviteUserByEmail(email, {
    redirectTo: `${getSiteUrl()}/auth/confirm`,
  });
  if (inviteError || !invited?.user) {
    if (
      inviteError?.code === "email_exists" ||
      /already been registered/i.test(inviteError?.message ?? "")
    ) {
      return {
        error:
          "Este e-mail já tem uma conta no sistema. Por enquanto, só é possível convidar e-mails novos.",
      };
    }
    if (inviteError?.status === 429) {
      return { error: "Limite de e-mails atingido. Aguarde um pouco e tente de novo." };
    }
    return { error: MSG_ERRO };
  }

  // 3) Liga a pessoa ao motel usando a sessao do DONO (chave publica):
  //    o banco (RLS members_insert) confere de novo se ele e dono.
  const { error: insertError } = await owner.supabase
    .from("motel_members")
    .insert({ motel_id: motelId, user_id: invited.user.id, role });

  if (insertError) {
    // Desfaz a conta recem-criada para nao deixar convite "solto".
    await admin.auth.admin.deleteUser(invited.user.id);
    return { error: MSG_ERRO };
  }

  await owner.supabase.rpc("log_audit", {
    p_motel: motelId,
    p_action: "membro_convidado",
    p_details: { user_id: invited.user.id, role },
  });

  revalidatePath(`/painel/equipe/${motelId}`);
  return { success: `Convite enviado para ${email}.` };
}

// ---------- TROCAR PERFIL ----------
export async function changeRole(_prev: TeamState, formData: FormData): Promise<TeamState> {
  const motelId = text(formData, "motelId");
  const userId = text(formData, "userId");
  const role = text(formData, "role");
  if (!isUuid(userId) || !isRole(role)) return { error: MSG_ERRO };

  const owner = await requireOwner(motelId);
  if (!owner) return { error: MSG_SEM_PERMISSAO };
  if (owner.userId === userId) return { error: MSG_PROPRIO };

  const { data, error } = await owner.supabase
    .from("motel_members")
    .update({ role })
    .eq("motel_id", motelId)
    .eq("user_id", userId)
    .select("user_id");
  if (error) return { error: friendlyDbError(error.message) };
  if (!data?.length) return { error: MSG_ERRO };

  await owner.supabase.rpc("log_audit", {
    p_motel: motelId,
    p_action: "perfil_alterado",
    p_details: { user_id: userId, role },
  });

  revalidatePath(`/painel/equipe/${motelId}`);
  return { success: "Perfil atualizado." };
}

// ---------- DESATIVAR / REATIVAR ----------
export async function setActive(_prev: TeamState, formData: FormData): Promise<TeamState> {
  const motelId = text(formData, "motelId");
  const userId = text(formData, "userId");
  const active = text(formData, "active") === "true";
  if (!isUuid(userId)) return { error: MSG_ERRO };

  const owner = await requireOwner(motelId);
  if (!owner) return { error: MSG_SEM_PERMISSAO };
  if (owner.userId === userId) return { error: MSG_PROPRIO };

  const { data, error } = await owner.supabase
    .from("motel_members")
    .update({ active })
    .eq("motel_id", motelId)
    .eq("user_id", userId)
    .select("user_id");
  if (error) return { error: friendlyDbError(error.message) };
  if (!data?.length) return { error: MSG_ERRO };

  await owner.supabase.rpc("log_audit", {
    p_motel: motelId,
    p_action: active ? "membro_reativado" : "membro_desativado",
    p_details: { user_id: userId },
  });

  revalidatePath(`/painel/equipe/${motelId}`);
  return { success: active ? "Acesso reativado." : "Acesso desativado." };
}
