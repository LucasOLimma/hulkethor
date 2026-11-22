import type { Period } from "./periods";

// =====================================================================
// REGRAS DAS RESERVAS (usadas no servidor e na tela)
// =====================================================================

export type ReservationStatus = "confirmada" | "chegou" | "concluida" | "cancelada" | "nao_compareceu";

export const STATUS_LABEL: Record<ReservationStatus, string> = {
  confirmada: "Confirmada",
  chegou: "Em andamento",
  concluida: "Concluída",
  cancelada: "Cancelada",
  nao_compareceu: "Não compareceu",
};

/** Mudancas de situacao permitidas (qualquer outra e recusada no servidor). */
export const TRANSITIONS: Record<ReservationStatus, { to: ReservationStatus; label: string; tone: "primary" | "danger" | "neutral" }[]> = {
  confirmada: [
    { to: "chegou", label: "Registrar chegada", tone: "primary" },
    { to: "nao_compareceu", label: "Não compareceu", tone: "neutral" },
    { to: "cancelada", label: "Cancelar", tone: "danger" },
  ],
  chegou: [{ to: "concluida", label: "Registrar saída", tone: "primary" }],
  concluida: [],
  cancelada: [],
  nao_compareceu: [],
};

export function isStatus(v: unknown): v is ReservationStatus {
  return typeof v === "string" && v in TRANSITIONS;
}

/** Reservas que ocupam a suite (contam para conflito de horario). */
export const BLOCKING_STATUSES: ReservationStatus[] = ["confirmada", "chegou"];

/** Tempo de limpeza entre uma reserva e a proxima, em minutos. */
export const CLEANING_MINUTES = 30;
/** Pernoite termina neste horario do dia seguinte. */
export const OVERNIGHT_CHECKOUT = "12:00";

const DURATION_MIN: Record<Exclude<Period, "pernoite">, number> = { "3h": 180, "6h": 360, "12h": 720 };

function toMinutes(date: string, time: string) {
  const [y, m, d] = date.split("-").map(Number);
  const [hh, mm] = time.split(":").map(Number);
  return Date.UTC(y, m - 1, d) / 60000 + hh * 60 + mm;
}

/** Intervalo [inicio, fim) da reserva em minutos (fuso do proprio motel). */
export function reservationInterval(date: string, time: string, period: Period) {
  const start = toMinutes(date, time);
  if (period === "pernoite") {
    const [y, m, d] = date.split("-").map(Number);
    const next = new Date(Date.UTC(y, m - 1, d + 1)).toISOString().slice(0, 10);
    return { start, end: Math.max(toMinutes(next, OVERNIGHT_CHECKOUT), start + 60) };
  }
  return { start, end: start + DURATION_MIN[period] };
}

/** Dois intervalos se chocam (considerando a limpeza entre eles)? */
export function overlaps(a: { start: number; end: number }, b: { start: number; end: number }) {
  return a.start < b.end + CLEANING_MINUTES && b.start < a.end + CLEANING_MINUTES;
}

/** Horario de saida previsto, para mostrar na tela. */
export function checkoutLabel(date: string, time: string, period: Period) {
  const { end } = reservationInterval(date, time, period);
  const d = new Date(end * 60000);
  const sameDay = d.toISOString().slice(0, 10) === date;
  const hhmm = d.toISOString().slice(11, 16);
  return sameDay ? hhmm : `${hhmm} (dia seguinte)`;
}

const CODE_ALPHABET = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789"; // sem 0/O e 1/I (evita confusao)

/** Codigo curto e aleatorio da reserva, ex.: K7MP3Q. */
export function newReservationCode() {
  const bytes = new Uint8Array(6);
  crypto.getRandomValues(bytes);
  return Array.from(bytes, (b) => CODE_ALPHABET[b % CODE_ALPHABET.length]).join("");
}
