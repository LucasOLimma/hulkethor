// Periodos de permanencia. Sao os mesmos valores aceitos pela coluna
// reservations.period no banco (ver supabase/01_base_multi_motel.sql).
export const PERIODS = ["3h", "6h", "12h", "pernoite"] as const;
export type Period = (typeof PERIODS)[number];

export const PERIOD_LABEL: Record<Period, string> = {
  "3h": "3 horas",
  "6h": "6 horas",
  "12h": "12 horas",
  pernoite: "Pernoite",
};

// Precos ficam em CENTAVOS no banco (suites.prices_cents), ex.: {"3h": 9000}.
export type PricesCents = Partial<Record<Period, number>>;

const brl = new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" });

export function formatCents(cents: number): string {
  return brl.format(cents / 100);
}

// Para preencher o campo de edicao: 9000 -> "90,00"
export function centsToInput(cents: number | undefined): string {
  if (cents === undefined) return "";
  return (cents / 100).toFixed(2).replace(".", ",");
}

// Converte o que a pessoa digitou ("90", "90,50", "1.234,56", "R$ 90")
// em centavos. Devolve null se for invalido, undefined se estiver vazio.
export function parseReais(input: string): number | null | undefined {
  let s = input.replace(/R\$|\s/g, "");
  if (!s) return undefined;
  if (s.includes(",")) s = s.replace(/\./g, "").replace(",", ".");
  if (!/^\d+(\.\d{1,2})?$/.test(s)) return null;
  const cents = Math.round(Number(s) * 100);
  return cents <= 100_000_000 ? cents : null; // ate R$ 1.000.000,00
}

// Le o JSON do banco com seguranca (ignora chaves/valores estranhos).
export function readPrices(value: unknown): PricesCents {
  const out: PricesCents = {};
  if (value && typeof value === "object") {
    for (const p of PERIODS) {
      const v = (value as Record<string, unknown>)[p];
      if (typeof v === "number" && Number.isInteger(v) && v >= 0) out[p] = v;
    }
  }
  return out;
}
