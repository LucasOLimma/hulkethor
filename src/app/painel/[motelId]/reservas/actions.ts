"use server";

import { revalidatePath } from "next/cache";
import { can, requireMotel } from "@/lib/motel-access";
import { todayIn, addDays } from "@/lib/dashboard-data";
import { PERIODS, PERIOD_LABEL, parseReais, readPrices, type Period } from "@/lib/periods";
import {
  BLOCKING_STATUSES,
  STATUS_LABEL,
  TRANSITIONS,
  isStatus,
  newReservationCode,
  overlaps,
  reservationInterval,
} from "@/lib/reservations";

export type ReservationState = { error?: string; success?: string; savedAt?: number } | undefined;

const MSG_SEM_PERMISSAO = "Você não tem permissão para gerenciar reservas deste estabelecimento.";
const MSG_ERRO = "Não foi possível concluir agora. Tente novamente.";
// erro do banco quando a regra "reservas_sem_conflito" (02_reservas_sem_conflito.sql) barra a gravacao
const MSG_CONFLITO_BANCO = "Esta suíte acabou de ser reservada nesse horário por outra pessoa. Escolha outro horário ou outra suíte.";
const isOverlap = (e: { code?: string } | null) => e?.code === "23P01";
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function text(fd: FormData, field: string, max = 200) {
  const v = fd.get(field);
  return typeof v === "string" ? v.trim().slice(0, max) : "";
}

/** So dono e recepcao ATIVOS deste motel (conferido no banco). */
async function requireDesk(motelId: string) {
  const ctx = await requireMotel(motelId);
  if (!ctx || !can(ctx.role).reservations) return null;
  return ctx;
}
type Desk = NonNullable<Awaited<ReturnType<typeof requireDesk>>>;

async function audit(ctx: Desk, action: string, details: Record<string, unknown>) {
  await ctx.supabase.rpc("log_audit", { p_motel: ctx.motel.id, p_action: action, p_details: details });
}

/** Le e valida os campos do formulario (nova reserva ou edicao). */
async function readForm(ctx: Desk, fd: FormData) {
  const suiteId = text(fd, "suiteId");
  const date = text(fd, "date", 10);
  const time = text(fd, "time", 5);
  const period = text(fd, "period", 10) as Period;
  const guest = text(fd, "guest", 80);
  const decoration = text(fd, "decoration", 200);
  const adult = fd.get("adult") === "on";

  if (!UUID_RE.test(suiteId)) return { error: "Escolha a suíte." } as const;
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) return { error: "Informe a data." } as const;
  if (!/^\d{2}:\d{2}$/.test(time)) return { error: "Informe o horário de chegada." } as const;
  if (!PERIODS.includes(period)) return { error: "Escolha o período." } as const;
  if (!adult) return { error: "Confirme que os hóspedes são maiores de 18 anos." } as const;

  const today = todayIn(ctx.motel.timezone);
  if (date < today) return { error: "A data não pode estar no passado." } as const;
  if (date > addDays(today, 365)) return { error: "Só é possível reservar com até 1 ano de antecedência." } as const;

  // a suite precisa ser DESTE motel, estar ativa e oferecer o periodo
  const { data: suite } = await ctx.supabase
    .from("suites")
    .select("id, number, active, prices_cents")
    .eq("id", suiteId)
    .eq("motel_id", ctx.motel.id)
    .maybeSingle();
  if (!suite) return { error: "Suíte não encontrada neste estabelecimento." } as const;
  if (!suite.active) return { error: `A suíte ${suite.number} está desativada.` } as const;
  const prices = readPrices(suite.prices_cents);
  if (prices[period] === undefined) {
    return { error: `A suíte ${suite.number} não oferece o período ${PERIOD_LABEL[period]}.` } as const;
  }

  // valor: o digitado, ou o preco da suite para o periodo
  const typed = parseReais(text(fd, "total", 20));
  if (typed === null) return { error: "Valor inválido. Use, por exemplo, 150,00." } as const;
  const total = typed ?? prices[period]!;

  return {
    ok: {
      suiteId,
      suiteNumber: suite.number as string,
      date,
      time,
      period,
      guest: guest || null,
      decoration: decoration || null,
      total,
    },
  } as const;
}

/** Ha outra reserva ocupando a suite nesse horario (com tempo de limpeza)? */
async function findConflict(ctx: Desk, f: { suiteId: string; date: string; time: string; period: Period }, ignoreId?: string) {
  let q = ctx.supabase
    .from("reservations")
    .select("id, code, stay_date, arrival_time, period")
    .eq("motel_id", ctx.motel.id)
    .eq("suite_id", f.suiteId)
    .in("status", BLOCKING_STATUSES)
    .gte("stay_date", addDays(f.date, -1))
    .lte("stay_date", addDays(f.date, 1));
  if (ignoreId) q = q.neq("id", ignoreId);
  const { data, error } = await q;
  if (error) return { error: true as const };
  const mine = reservationInterval(f.date, f.time, f.period);
  const hit = (data ?? []).find((r) => {
    // reservas antigas sem horario: considera o dia inteiro ocupado
    const t = (r.arrival_time as string | null)?.slice(0, 5) ?? "00:00";
    const other = r.arrival_time
      ? reservationInterval(r.stay_date as string, t, r.period as Period)
      : { start: reservationInterval(r.stay_date as string, "00:00", "3h").start, end: reservationInterval(r.stay_date as string, "23:59", "3h").start };
    return overlaps(mine, other);
  });
  return { hit: hit ? { code: hit.code as string, date: hit.stay_date as string, time: (hit.arrival_time as string | null)?.slice(0, 5) } : null };
}

// ---------- NOVA RESERVA ----------
export async function createReservation(_prev: ReservationState, fd: FormData): Promise<ReservationState> {
  const ctx = await requireDesk(text(fd, "motelId"));
  if (!ctx) return { error: MSG_SEM_PERMISSAO };

  const r = await readForm(ctx, fd);
  if ("error" in r) return { error: r.error };
  const f = r.ok;

  const conflict = await findConflict(ctx, f);
  if ("error" in conflict) return { error: MSG_ERRO };
  if (conflict.hit) {
    return {
      error: `A suíte ${f.suiteNumber} já está reservada nesse horário (reserva ${conflict.hit.code}, ${conflict.hit.date.split("-").reverse().join("/")}${conflict.hit.time ? ` às ${conflict.hit.time}` : ""}).`,
    };
  }

  // codigo unico por motel: tenta de novo no raro caso de repeticao
  for (let attempt = 0; attempt < 5; attempt++) {
    const code = newReservationCode();
    const { data, error } = await ctx.supabase
      .from("reservations")
      .insert({
        motel_id: ctx.motel.id,
        suite_id: f.suiteId,
        code,
        guest_name: f.guest,
        stay_date: f.date,
        period: f.period,
        arrival_time: f.time,
        total_cents: f.total,
        decoration: f.decoration,
        status: "confirmada",
        adult_confirmed: true,
      })
      .select("id")
      .single();
    if (!error && data) {
      await audit(ctx, "reserva_criada", { reservation_id: data.id, code, suite: f.suiteNumber, date: f.date });
      revalidatePath(`/painel/${ctx.motel.id}`, "layout");
      return { success: `Reserva ${code} criada para a suíte ${f.suiteNumber}.`, savedAt: Date.now() };
    }
    if (isOverlap(error)) return { error: MSG_CONFLITO_BANCO };
    if (error?.code !== "23505") return { error: MSG_ERRO };
  }
  return { error: MSG_ERRO };
}

// ---------- EDITAR (so reservas confirmadas) ----------
export async function updateReservation(_prev: ReservationState, fd: FormData): Promise<ReservationState> {
  const ctx = await requireDesk(text(fd, "motelId"));
  if (!ctx) return { error: MSG_SEM_PERMISSAO };
  const id = text(fd, "reservationId");
  if (!UUID_RE.test(id)) return { error: MSG_ERRO };

  const r = await readForm(ctx, fd);
  if ("error" in r) return { error: r.error };
  const f = r.ok;

  const conflict = await findConflict(ctx, f, id);
  if ("error" in conflict) return { error: MSG_ERRO };
  if (conflict.hit) return { error: `A suíte ${f.suiteNumber} já está reservada nesse horário (reserva ${conflict.hit.code}).` };

  const { data, error } = await ctx.supabase
    .from("reservations")
    .update({
      suite_id: f.suiteId,
      guest_name: f.guest,
      stay_date: f.date,
      period: f.period,
      arrival_time: f.time,
      total_cents: f.total,
      decoration: f.decoration,
    })
    .eq("id", id)
    .eq("motel_id", ctx.motel.id)
    .eq("status", "confirmada") // so edita se ainda estiver confirmada
    .select("code");
  if (isOverlap(error)) return { error: MSG_CONFLITO_BANCO };
  if (error) return { error: MSG_ERRO };
  if (!data?.length) return { error: "Só é possível editar reservas confirmadas." };

  await audit(ctx, "reserva_editada", { reservation_id: id, code: data[0].code });
  revalidatePath(`/painel/${ctx.motel.id}`, "layout");
  return { success: "Reserva atualizada.", savedAt: Date.now() };
}

// ---------- MUDAR SITUACAO ----------
export async function changeReservationStatus(_prev: ReservationState, fd: FormData): Promise<ReservationState> {
  const ctx = await requireDesk(text(fd, "motelId"));
  if (!ctx) return { error: MSG_SEM_PERMISSAO };
  const id = text(fd, "reservationId");
  const from = text(fd, "from");
  const to = text(fd, "to");
  if (!UUID_RE.test(id) || !isStatus(from) || !isStatus(to)) return { error: MSG_ERRO };
  if (!TRANSITIONS[from].some((t) => t.to === to)) return { error: "Mudança de situação não permitida." };

  // confirmar um pedido de cliente: o horario precisa estar livre
  if (from === "pendente" && to === "confirmada") {
    const { data: rv } = await ctx.supabase
      .from("reservations")
      .select("suite_id, stay_date, arrival_time, period")
      .eq("id", id)
      .eq("motel_id", ctx.motel.id)
      .maybeSingle();
    if (!rv) return { error: MSG_ERRO };
    const conflict = await findConflict(
      ctx,
      { suiteId: rv.suite_id as string, date: rv.stay_date as string, time: ((rv.arrival_time as string | null) ?? "00:00").slice(0, 5), period: rv.period as Period },
      id,
    );
    if ("error" in conflict) return { error: MSG_ERRO };
    if (conflict.hit) return { error: `Não dá para confirmar: a suíte já está reservada nesse horário (reserva ${conflict.hit.code}). Recuse o pedido ou combine outro horário com o cliente.` };
  }

  // so muda se a reserva ainda estiver na situacao que a tela mostrou
  const { data, error } = await ctx.supabase
    .from("reservations")
    .update({ status: to })
    .eq("id", id)
    .eq("motel_id", ctx.motel.id)
    .eq("status", from)
    .select("code");
  if (isOverlap(error)) return { error: MSG_CONFLITO_BANCO };
  if (error) return { error: MSG_ERRO };
  if (!data?.length) return { error: "A reserva mudou enquanto você olhava. Atualize a página." };

  await audit(ctx, "reserva_situacao", { reservation_id: id, code: data[0].code, de: from, para: to });
  revalidatePath(`/painel/${ctx.motel.id}`, "layout");
  return { success: `Reserva ${data[0].code}: ${STATUS_LABEL[to].toLowerCase()}.` };
}
