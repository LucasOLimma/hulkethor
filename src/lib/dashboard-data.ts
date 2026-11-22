import "server-only";
import type { requireMotel } from "./motel-access";

// =====================================================================
// NUMEROS DO DASHBOARD — calculados so com dados reais do banco e SO do
// motel informado (filtro explicito por motel_id + regras RLS do banco).
// Nada e inventado: se nao ha reservas, os numeros sao zero.
// =====================================================================

type Ctx = NonNullable<Awaited<ReturnType<typeof requireMotel>>>;

export type ReservationRow = {
  id: string;
  code: string;
  guest_name: string | null;
  stay_date: string;
  period: string;
  arrival_time: string | null;
  total_cents: number;
  status: string;
  suite_id: string;
  created_at: string;
};

export type SuiteRow = { id: string; number: string; type: string; active: boolean };

export type SuiteOpStatus = "livre" | "ocupada" | "reservada" | "desativada";

/** Reservas que contam como faturamento (exclui canceladas e nao comparecimentos). */
export const VALID_STATUSES = ["confirmada", "chegou", "concluida"];

export const STATUS_LABEL: Record<string, string> = {
  confirmada: "Confirmada",
  chegou: "Em andamento",
  concluida: "Concluída",
  cancelada: "Cancelada",
  nao_compareceu: "Não compareceu",
};

/** "Hoje" no fuso do motel, no formato AAAA-MM-DD. */
export function todayIn(timezone: string) {
  try {
    return new Intl.DateTimeFormat("en-CA", { timeZone: timezone }).format(new Date());
  } catch {
    return new Intl.DateTimeFormat("en-CA", { timeZone: "America/Sao_Paulo" }).format(new Date());
  }
}

export function addDays(isoDate: string, days: number) {
  const d = new Date(`${isoDate}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}

export const PERIOD_OPTIONS = [7, 30, 90] as const;
export type PeriodDays = (typeof PERIOD_OPTIONS)[number];

export function parsePeriod(value: string | undefined): PeriodDays {
  const n = Number(value);
  return (PERIOD_OPTIONS as readonly number[]).includes(n) ? (n as PeriodDays) : 30;
}

export async function loadDashboard(ctx: Ctx, days: PeriodDays) {
  const motelId = ctx.motel.id; // ja conferido no banco por requireMotel
  const today = todayIn(ctx.motel.timezone);
  const from = addDays(today, -(days - 1));
  const canSeeReservations = ctx.role === "dono" || ctx.role === "recepcao";

  const suitesQ = ctx.supabase
    .from("suites")
    .select("id, number, type, active")
    .eq("motel_id", motelId);

  const cols = "id, code, guest_name, stay_date, period, arrival_time, total_cents, status, suite_id, created_at";
  const periodQ = canSeeReservations
    ? ctx.supabase
        .from("reservations")
        .select(cols)
        .eq("motel_id", motelId)
        .gte("stay_date", from)
        .lte("stay_date", today)
        .limit(5000)
    : null;
  // reservas de ontem/hoje: para saber quais suites estao ocupadas agora
  // (pernoite atravessa a meia-noite)
  const nowQ = canSeeReservations
    ? ctx.supabase
        .from("reservations")
        .select(cols)
        .eq("motel_id", motelId)
        .gte("stay_date", addDays(today, -1))
        .lte("stay_date", today)
        .in("status", ["confirmada", "chegou"])
    : null;
  const recentQ = canSeeReservations
    ? ctx.supabase.from("reservations").select(cols).eq("motel_id", motelId).order("created_at", { ascending: false }).limit(8)
    : null;

  const [suitesR, periodR, nowR, recentR] = await Promise.all([suitesQ, periodQ, nowQ, recentQ]);
  const error = Boolean(suitesR.error || periodR?.error || nowR?.error || recentR?.error);

  const suites = ((suitesR.data ?? []) as SuiteRow[]).sort((a, b) =>
    a.number.localeCompare(b.number, "pt-BR", { numeric: true }),
  );
  const periodRows = (periodR?.data ?? []) as ReservationRow[];
  const nowRows = (nowR?.data ?? []) as ReservationRow[];
  const recent = (recentR?.data ?? []) as ReservationRow[];

  const valid = periodRows.filter((r) => VALID_STATUSES.includes(r.status));
  const revenueCents = valid.reduce((sum, r) => sum + r.total_cents, 0);
  const served = periodRows.filter((r) => r.status === "chegou" || r.status === "concluida").length;

  // serie diaria (todos os dias do periodo, inclusive os sem reserva)
  const daily = Array.from({ length: days }, (_, i) => ({ date: addDays(from, i), revenueCents: 0, reservations: 0 }));
  const byDate = new Map(daily.map((d) => [d.date, d]));
  for (const r of valid) {
    const d = byDate.get(r.stay_date);
    if (d) {
      d.revenueCents += r.total_cents;
      d.reservations += 1;
    }
  }

  // situacao de cada suite agora
  const occupied = new Set(nowRows.filter((r) => r.status === "chegou").map((r) => r.suite_id));
  const reservedToday = new Set(
    nowRows.filter((r) => r.status === "confirmada" && r.stay_date === today).map((r) => r.suite_id),
  );
  const suiteStatus = suites.map((s) => ({
    ...s,
    status: (!s.active
      ? "desativada"
      : occupied.has(s.id)
        ? "ocupada"
        : reservedToday.has(s.id)
          ? "reservada"
          : "livre") as SuiteOpStatus,
  }));
  const activeSuites = suites.filter((s) => s.active).length;
  const occupiedNow = suiteStatus.filter((s) => s.status === "ocupada").length;

  // suites em destaque: mais reservadas no periodo
  const perSuite = new Map<string, { count: number; revenueCents: number }>();
  for (const r of valid) {
    const cur = perSuite.get(r.suite_id) ?? { count: 0, revenueCents: 0 };
    cur.count += 1;
    cur.revenueCents += r.total_cents;
    perSuite.set(r.suite_id, cur);
  }
  const suiteById = new Map(suites.map((s) => [s.id, s]));
  const topSuites = [...perSuite.entries()]
    .map(([id, v]) => ({ suite: suiteById.get(id), ...v }))
    .filter((x) => x.suite)
    .sort((a, b) => b.count - a.count || b.revenueCents - a.revenueCents)
    .slice(0, 4);

  return {
    today,
    from,
    days,
    error,
    canSeeReservations,
    kpis: {
      revenueCents,
      reservations: valid.length,
      served,
      suitesTotal: suites.length,
      suitesAvailable: suiteStatus.filter((s) => s.status === "livre").length,
      occupancy: activeSuites ? occupiedNow / activeSuites : null,
      occupiedNow,
      activeSuites,
    },
    daily,
    topSuites,
    recent: recent.map((r) => ({ ...r, suiteNumber: suiteById.get(r.suite_id)?.number ?? "—" })),
    suiteStatus,
  };
}
