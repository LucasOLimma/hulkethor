// =====================================================================
// MAPA DAS SUITES AO VIVO + PREVISAO (dados de suite_board, 08_mapa_ao_vivo.sql)
//
// Todos os horarios chegam no horario LOCAL do motel, sem fuso
// ("2026-11-22T14:30:00"). Para fazer contas, tratamos todos do mesmo jeito
// (como se fossem UTC): as diferencas em minutos ficam certas.
// =====================================================================

export type BoardStatus = "ocupada" | "limpeza" | "problema" | "livre" | "desativada";

export type BoardSuite = {
  id: string;
  number: string;
  type: string;
  active: boolean;
  status: BoardStatus;
  checkout_expected: string | null;
  dirty_since: string | null;
  task_status: "aguardando" | "em_limpeza" | "problema" | null;
  cleaning_started: string | null;
  problem_notes: string | null;
  next_reservation: string | null;
  avg_clean_min: number | null;
  samples: number;
};
export type Board = { now: string; motel_avg_min: number | null; suites: BoardSuite[] };

/** Sem nenhum historico de limpeza, usa este tempo (o mesmo intervalo de limpeza das reservas). */
export const DEFAULT_CLEAN_MIN = 30;
/** Minimo de limpezas da propria suite para usar a media dela. */
const MIN_SAMPLES = 2;

export const toMs = (local: string) => Date.parse(local + "Z");
export const hhmm = (ms: number) => new Date(ms).toISOString().slice(11, 16);
const minutes = (ms: number) => Math.round(ms / 60000);

export type SuiteView = {
  suite: BoardSuite;
  color: "azul" | "amarelo" | "verde" | "vermelho" | "cinza";
  label: string;
  /** linha de detalhe (ex.: "Saída prevista 15:40", "12 de ~30 min") */
  detail: string;
  /** progresso da limpeza (0..1), so em limpeza */
  progress: number | null;
  /** passou do tempo medio */
  late: boolean;
  /** quando deve ficar pronta (ms), ou null se nao da para prever */
  readyAt: number | null;
  /** media usada e de onde veio */
  avgMin: number;
  avgSource: "suite" | "motel" | "padrao";
};

export function cleaningAverage(s: BoardSuite, motelAvg: number | null): { min: number; source: SuiteView["avgSource"] } {
  if (s.avg_clean_min && s.samples >= MIN_SAMPLES) return { min: s.avg_clean_min, source: "suite" };
  if (motelAvg) return { min: motelAvg, source: "motel" };
  return { min: DEFAULT_CLEAN_MIN, source: "padrao" };
}

export function viewSuite(s: BoardSuite, nowMs: number, motelAvg: number | null): SuiteView {
  const avg = cleaningAverage(s, motelAvg);
  const base = { suite: s, progress: null, late: false, avgMin: avg.min, avgSource: avg.source };
  switch (s.status) {
    case "desativada":
      return { ...base, color: "cinza", label: "Desativada", detail: "", readyAt: null };
    case "problema":
      return { ...base, color: "vermelho", label: "Com problema", detail: s.problem_notes ?? "Aguardando resolução", readyAt: null };
    case "livre":
      return {
        ...base,
        color: "verde",
        label: "Pronta",
        detail: s.next_reservation ? `Reservada às ${s.next_reservation}` : "Livre agora",
        readyAt: nowMs,
      };
    case "ocupada": {
      const out = s.checkout_expected ? toMs(s.checkout_expected) : null;
      if (out === null) return { ...base, color: "azul", label: "Ocupada", detail: "", readyAt: null };
      const overdue = out < nowMs;
      return {
        ...base,
        color: "azul",
        label: "Ocupada",
        detail: overdue ? `Saída prevista ${hhmm(out)} (já passou)` : `Saída prevista ${hhmm(out)}`,
        late: overdue,
        readyAt: Math.max(out, nowMs) + avg.min * 60000,
      };
    }
    case "limpeza": {
      const since = s.dirty_since ? toMs(s.dirty_since) : nowMs;
      const elapsed = Math.max(0, minutes(nowMs - since));
      const late = elapsed > avg.min;
      const started = s.task_status === "em_limpeza";
      return {
        ...base,
        color: "amarelo",
        label: started ? "Limpando" : "Aguardando limpeza",
        detail: late ? `${elapsed} min · ${elapsed - avg.min} min acima da média` : `${elapsed} de ~${avg.min} min`,
        progress: Math.min(1, elapsed / avg.min),
        late,
        // passou da media: "a qualquer momento" (agora)
        readyAt: Math.max(since + avg.min * 60000, nowMs),
      };
    }
  }
}

export type Forecast = {
  free: number;
  freeNoReservation: number;
  /** as proximas a ficar prontas (ocupadas e em limpeza), da mais cedo para a mais tarde */
  next: SuiteView[];
};

export function forecast(views: SuiteView[]): Forecast {
  const free = views.filter((v) => v.suite.status === "livre");
  const next = views
    .filter((v) => (v.suite.status === "limpeza" || v.suite.status === "ocupada") && v.readyAt !== null)
    .sort((a, b) => a.readyAt! - b.readyAt!);
  return {
    free: free.length,
    freeNoReservation: free.filter((v) => !v.suite.next_reservation).length,
    next: next.slice(0, 3),
  };
}

/** "em ~15 min (≈ 14:35)" / "a qualquer momento" */
export function readyText(readyAt: number, nowMs: number): string {
  const m = minutes(readyAt - nowMs);
  if (m <= 1) return "a qualquer momento";
  return `em ~${m} min (≈ ${hhmm(readyAt)})`;
}
