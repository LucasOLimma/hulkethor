"use server";

import { createClient } from "@/lib/supabase/server";
import { normalizePhone } from "@/lib/phone";

export type RequestState = { error?: string; code?: string } | undefined;

// Versao dos termos que o cliente aceita (gravada junto com o pedido).
// v2: inclui o celular (usado so para o cliente consultar/cancelar a reserva).
const TERMS_VERSION = "2026-11-v2";

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
  [/Celular invalido/, "Informe um celular com DDD, por exemplo (11) 98765-4321."],
];
const missingFn = (e: { code?: string } | null) => e?.code === "PGRST202" || e?.code === "42883";

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
  const phoneRaw = text(fd, "phone", 30);
  const phone = phoneRaw ? normalizePhone(phoneRaw) : null;
  if (!/^[a-z0-9-]{3,40}$/.test(slug) || !/^[0-9a-f-]{36}$/i.test(suite)) return { error: "Pedido inválido." };
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) return { error: "Escolha a data." };
  if (!/^\d{2}:\d{2}$/.test(time)) return { error: "Escolha o horário de chegada." };
  if (fd.get("adult") !== "on") return { error: "Confirme que todos os hóspedes são maiores de 18 anos." };
  if (fd.get("terms") !== "on") return { error: "Aceite o uso dos seus dados para a reserva." };
  if (fd.has("phone") && !phone) return { error: "Informe um celular com DDD, por exemplo (11) 98765-4321." };

  const supabase = await createClient();
  const base = { p_slug: slug, p_suite: suite, p_date: date, p_time: time, p_period: period, p_guest: guest || null, p_adult: true, p_terms: TERMS_VERSION };
  // com celular (07_portal_cliente.sql); sem o 07 rodado, usa a funcao antiga (03)
  let { data, error } = await supabase.rpc("public_request_reservation_v2", { ...base, p_phone: phone });
  if (missingFn(error)) ({ data, error } = await supabase.rpc("public_request_reservation", base));
  if (error) {
    const hit = FRIENDLY.find(([re]) => re.test(error.message ?? ""));
    return { error: hit ? hit[1] : "Não foi possível enviar o pedido agora. Tente novamente." };
  }
  return { code: data as string };
}

// ---------- horarios ja ocupados da suite no dia (sem dados de hospedes) ----------
export async function loadAvailability(slug: string, suite: string, date: string): Promise<{ start: string; end: string }[] | null> {
  if (!/^[a-z0-9-]{3,40}$/.test(slug) || !/^[0-9a-f-]{36}$/i.test(suite) || !/^\d{4}-\d{2}-\d{2}$/.test(date)) return null;
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("public_availability", { p_slug: slug, p_suite: suite, p_date: date });
  if (error || !Array.isArray(data)) return null;
  return data as { start: string; end: string }[];
}

// ---------- Minha Reserva (codigo + celular) ----------
export type MyReservation = {
  code: string;
  status: string;
  suite_number: string;
  suite_type: string;
  stay_date: string;
  arrival_time: string | null;
  period: string;
  total_cents: number;
  guest_name: string | null;
  cancel_hours: number;
  can_cancel: boolean;
};
export type LookupState = { error?: string; reservation?: MyReservation; code?: string; phone?: string; cancelled?: boolean } | undefined;

const MSG_NAO_ACHOU = "Não encontramos uma reserva com esse código e celular. Confira os dados.";
const MSG_TENTATIVAS = "Muitas tentativas. Aguarde 15 minutos e tente de novo.";

function readLookup(fd: FormData) {
  const slug = text(fd, "slug", 40);
  const code = text(fd, "code", 10).toUpperCase().replace(/[^A-Z0-9]/g, "");
  const phone = normalizePhone(text(fd, "phone", 30));
  if (!/^[a-z0-9-]{3,40}$/.test(slug)) return { error: "Pedido inválido." } as const;
  if (code.length !== 6) return { error: "O código tem 6 letras e números." } as const;
  if (!phone) return { error: "Informe o celular com DDD usado no pedido." } as const;
  return { slug, code, phone } as const;
}

export async function lookupReservation(_p: LookupState, fd: FormData): Promise<LookupState> {
  const r = readLookup(fd);
  if ("error" in r) return { error: r.error };
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("public_my_reservation", { p_slug: r.slug, p_code: r.code, p_phone: r.phone });
  if (error) return { error: /Muitas tentativas/.test(error.message ?? "") ? MSG_TENTATIVAS : "Não foi possível consultar agora. Tente novamente." };
  if (!data) return { error: MSG_NAO_ACHOU };
  return { reservation: data as MyReservation, code: r.code, phone: r.phone };
}

export async function cancelMyReservation(_p: LookupState, fd: FormData): Promise<LookupState> {
  const r = readLookup(fd);
  if ("error" in r) return { error: r.error };
  if (fd.get("confirm") !== "on") return { error: "Confirme que deseja cancelar." };
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("public_cancel_reservation", { p_slug: r.slug, p_code: r.code, p_phone: r.phone });
  if (error) {
    const m = error.message ?? "";
    return {
      error: /Muitas tentativas/.test(m)
        ? MSG_TENTATIVAS
        : /Prazo/.test(m)
          ? "O prazo para cancelar pelo site terminou. Fale com o motel."
          : "Não foi possível cancelar agora. Tente novamente.",
    };
  }
  if (!data) return { error: MSG_NAO_ACHOU };
  return { reservation: data as MyReservation, code: r.code, phone: r.phone, cancelled: true };
}
