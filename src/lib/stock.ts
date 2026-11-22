// Estoque: nomes e regras usados nas telas. Os valores sao os mesmos aceitos
// pelo banco (supabase/04_estoque.sql).

export const LOCATIONS = ["estoque", "em_uso", "lavanderia"] as const;
export type Location = (typeof LOCATIONS)[number];
export const LOCATION_LABEL: Record<Location, string> = {
  estoque: "Estoque",
  em_uso: "Nas suítes",
  lavanderia: "Lavanderia",
};

export const UNITS = ["un", "pct", "cx", "par", "kg", "g", "l", "ml"] as const;
export type Unit = (typeof UNITS)[number];
export const UNIT_LABEL: Record<Unit, string> = {
  un: "unidade",
  pct: "pacote",
  cx: "caixa",
  par: "par",
  kg: "kg",
  g: "g",
  l: "litro",
  ml: "ml",
};

export type ProductKind = "consumo" | "enxoval";
export const KIND_LABEL: Record<ProductKind, string> = { consumo: "Consumo", enxoval: "Enxoval (circula)" };

export const MOVEMENT_LABEL: Record<string, string> = {
  entrada: "Entrada",
  consumo: "Consumo",
  uso_interno: "Uso interno",
  perda: "Perda",
  avaria: "Avaria",
  vencimento: "Vencimento",
  transferencia: "Transferência",
  ajuste: "Ajuste de conferência",
  estorno: "Estorno",
};

/** Saidas que a recepcao pode registrar; as demais sao so do dono. */
export const DESK_EXITS = ["consumo", "uso_interno"] as const;
export const OWNER_EXITS = ["perda", "avaria", "vencimento"] as const;

export type StockAlert = {
  kind: "negativo" | "abaixo_minimo" | "vencendo" | "vencido";
  productId: string;
  productName: string;
  location: Location;
  qty: number;
  minQty: number;
  unit: Unit;
  lotCode: string | null;
  expiresOn: string | null;
};

export const ALERT_LABEL: Record<StockAlert["kind"], string> = {
  negativo: "Saldo negativo",
  abaixo_minimo: "Abaixo do mínimo",
  vencendo: "Vence em breve",
  vencido: "Vencido",
};

const qtyFmt = new Intl.NumberFormat("pt-BR", { maximumFractionDigits: 3 });
export function formatQty(n: number, unit?: string): string {
  return unit ? `${qtyFmt.format(n)} ${unit}` : qtyFmt.format(n);
}

/** "1,5" ou "1.5" -> 1.5. Devolve null se invalido ou <= 0 (ou < 0 com allowZero). */
export function parseQty(input: string, allowZero = false): number | null {
  const s = input.replace(/\s/g, "").replace(",", ".");
  if (!/^\d{1,9}(\.\d{1,3})?$/.test(s)) return null;
  const n = Number(s);
  if (allowZero ? n < 0 : n <= 0) return null;
  return n;
}

export function formatDateBR(iso: string): string {
  const [y, m, d] = iso.slice(0, 10).split("-");
  return `${d}/${m}/${y}`;
}

/** Converte a linha devolvida pela funcao stock_alerts do banco. */
export function readAlerts(rows: unknown): StockAlert[] {
  if (!Array.isArray(rows)) return [];
  return rows.map((r) => ({
    kind: r.kind,
    productId: r.product_id,
    productName: r.product_name,
    location: r.location,
    qty: Number(r.qty),
    minQty: Number(r.min_qty),
    unit: r.unit,
    lotCode: r.lot_code ?? null,
    expiresOn: r.expires_on ?? null,
  }));
}

/** Tabela ainda nao existe no banco (o 04_estoque.sql nao foi rodado). */
export function isMissingTable(e: { code?: string } | null | undefined): boolean {
  return e?.code === "42P01" || e?.code === "PGRST205" || e?.code === "PGRST202" || e?.code === "42883";
}

/** Instante (ISO, UTC) em que comeca o dia `date` (AAAA-MM-DD) no fuso do motel. */
export function startOfDayIso(date: string, timeZone: string): string {
  const guess = new Date(`${date}T00:00:00Z`);
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone,
    hourCycle: "h23",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  }).formatToParts(guess);
  const n = (t: string) => Number(parts.find((x) => x.type === t)?.value);
  const shown = Date.UTC(n("year"), n("month") - 1, n("day"), n("hour"), n("minute"), n("second"));
  return new Date(guess.getTime() - (shown - guess.getTime())).toISOString();
}
