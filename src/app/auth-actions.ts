"use server";

import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { getSiteUrl } from "@/lib/supabase/env";

// Estado devolvido para os formularios mostrarem mensagens.
export type FormState = { error?: string; success?: string } | undefined;

const MSG_LOGIN_INVALIDO = "E-mail ou senha incorretos.";
const MSG_RECUPERACAO =
  "Se o e-mail estiver cadastrado, você receberá um link para criar uma nova senha.";
const MSG_ERRO_GENERICO = "Não foi possível concluir agora. Tente novamente.";

function readText(formData: FormData, field: string, max = 200): string {
  const value = formData.get(field);
  return typeof value === "string" ? value.slice(0, max) : "";
}

// ---------- ENTRAR ----------
export async function signIn(_prev: FormState, formData: FormData): Promise<FormState> {
  const email = readText(formData, "email").trim().toLowerCase();
  const password = readText(formData, "password", 200);

  if (!email || !password) return { error: MSG_LOGIN_INVALIDO };

  const supabase = await createClient();
  const { error } = await supabase.auth.signInWithPassword({ email, password });

  // Qualquer falha vira a MESMA mensagem: assim ninguem descobre
  // se o e-mail existe ou se so a senha esta errada.
  if (error) return { error: MSG_LOGIN_INVALIDO };

  redirect("/painel");
}

// ---------- SAIR ----------
export async function signOut(): Promise<void> {
  const supabase = await createClient();
  await supabase.auth.signOut();
  redirect("/login");
}

// ---------- ESQUECI A SENHA ----------
export async function requestPasswordReset(
  _prev: FormState,
  formData: FormData,
): Promise<FormState> {
  const email = readText(formData, "email").trim().toLowerCase();

  if (email) {
    const supabase = await createClient();
    // O resultado e ignorado de proposito: a resposta e sempre a mesma.
    await supabase.auth.resetPasswordForEmail(email, {
      redirectTo: `${getSiteUrl()}/auth/confirm`,
    });
  }
  return { success: MSG_RECUPERACAO };
}

// ---------- CRIAR NOVA SENHA (depois do link do e-mail) ----------
export async function updatePassword(
  _prev: FormState,
  formData: FormData,
): Promise<FormState> {
  const password = readText(formData, "password", 200);
  const confirm = readText(formData, "confirm", 200);

  if (password.length < 8) return { error: "A senha precisa ter pelo menos 8 caracteres." };
  if (password !== confirm) return { error: "As duas senhas não são iguais." };

  const supabase = await createClient();
  const { error } = await supabase.auth.updateUser({ password });
  if (error) return { error: MSG_ERRO_GENERICO };

  redirect("/painel");
}
