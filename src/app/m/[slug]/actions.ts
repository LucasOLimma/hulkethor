"use server";

import { createClient } from "@/lib/supabase/server";

export type RequestState = { error?: string; code?: string } | undefined;

// Versao dos termos que o cliente aceita (gravada junto com o pedido).
const TERMS_VERSION = "2026-11-v1";

// Mensagens do banco (03_pagina_publica.sql) -> texto amigavel
const FRIENDLY: [RegExp, string][] = [
  [/Horario indisponivel/, "Esse horário já está reservado nessa suíte. Escolha outro horário ou outra suíte."],
  [/Horario ja passou/, "Esse horário já passou. Escolha um horário futuro."],
  [/Data fora do periodo/, "Escolha uma data entre hoje e os próximos 60 dias."],
  [/Periodo nao oferecido/, "Essa suíte não oferece o período escolhido."],
  [/Suite indisponivel/, "Essa suíte não está disponível."],
  [/Muitos pedidos/, "Muitos pedidos neste momento. Tente novamente em alguns minutos."],
  [/maioridade/, "Confirme que todos os hóspedes são maiores de 18 anos."],
  [/termos/, "Aceite o uso dos seus dados para a reserva."],
];

function text(fd: FormData, field: string, max = 100) {
  const v = fd.get(field);
  return typeof v === "string" ? v.trim().slice(0, max) : "";
}

// ---------- pedido de reserva do cliente (sem login) ----------
// Tudo e validado de novo no BANCO pela funcao public_request_reservation
// (preco da tabela, horario livre, suite ativa do proprio motel, limites).
export async function requestReservation(_prev: RequestState, fd: FormData): Promise<RequestState> {
  // armadilha para robos: campo invisivel que pessoas nao preenchem
  if (text(fd, "website")) return { error: "Não foi possível enviar o pedido." };

  const slug = text(fd, "slug", 40);
  const suite = text(fd, "suiteId", 36);
  const date = text(fd, "date", 10);
  const time = text(fd, "time", 5);
  const period = text(fd, "period", 10);
  const guest = text(fd, "guest", 80);
  if (!/^[a-z0-9-]{3,40}$/.test(slug) || !/^[0-9a-f-]{36}$/i.test(suite)) return { error: "Pedido inválido." };
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) return { error: "Escolha a data." };
  if (!/^\d{2}:\d{2}$/.test(time)) return { error: "Escolha o horário de chegada." };
  if (fd.get("adult") !== "on") return { error: "Confirme que todos os hóspedes são maiores de 18 anos." };
  if (fd.get("terms") !== "on") return { error: "Aceite o uso dos seus dados para a reserva." };

  const supabase = await createClient();
  const { data, error } = await supabase.rpc("public_request_reservation", {
    p_slug: slug,
    p_suite: suite,
    p_date: date,
    p_time: time,
    p_period: period,
    p_guest: guest || null,
    p_adult: true,
    p_terms: TERMS_VERSION,
  });
  if (error) {
    const hit = FRIENDLY.find(([re]) => re.test(error.message ?? ""));
    return { error: hit ? hit[1] : "Não foi possível enviar o pedido agora. Tente novamente." };
  }
  return { code: data as string };
}
