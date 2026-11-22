import type { Metadata } from "next";
import { formatCents, PERIOD_LABEL, PERIODS, type PricesCents } from "@/lib/periods";
import { SuiteViewer } from "@/components/suite3d/suite-viewer";
import type { SuiteInfo } from "@/components/suite3d/types";

export const metadata: Metadata = {
  title: "Suíte Imperial · Tour virtual 3D",
  description: "Conheça a suíte demonstrativa em 3D: gire, aproxime e explore o ambiente.",
};

// Suite DEMONSTRATIVA: dados fixos, nao vem do banco e nao precisa de login.
// Serve para validar a experiencia antes de liberar para os motéis.
const demoPrices: PricesCents = { "3h": 15000, "6h": 21000, "12h": 28000, pernoite: 34000 };

const info: SuiteInfo = {
  name: "Suíte Imperial",
  type: "Luxo com hidromassagem",
  capacity: 2,
  description:
    "Ambiente amplo com cama king size, hidromassagem com cromoterapia em deque de mármore, espaço de estar e iluminação cênica com três climas.",
  amenities: [
    "Hidromassagem",
    "Cromoterapia",
    'Smart TV 65"',
    "Som ambiente",
    "Ar-condicionado",
    "Frigobar",
    "Garagem privativa",
    "Wi-Fi",
  ],
  prices: PERIODS.filter((p) => demoPrices[p] !== undefined).map((p) => ({
    label: PERIOD_LABEL[p],
    value: formatCents(demoPrices[p]!),
  })),
  photos: [],
};

export default function DemoSuite3DPage() {
  return <SuiteViewer info={info} badge="Demonstração · Tour virtual 3D" />;
}
