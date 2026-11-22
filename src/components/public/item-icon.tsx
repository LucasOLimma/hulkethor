// Icone para os itens mais comuns das suites (o texto continua sendo o que
// o dono escreveu; o icone so ajuda a ler mais rapido).
const RULES: [RegExp, React.ReactNode][] = [
  [/hidro|jacuzzi|ofur/i, <><path d="M3 13h18v2a4 4 0 0 1-4 4H7a4 4 0 0 1-4-4v-2Z" /><path d="M6 13V6a2 2 0 0 1 4 0" /><path d="M14 8c0 1 1 1 1 2s-1 1-1 2M18 8c0 1 1 1 1 2s-1 1-1 2" /></>],
  [/piscina/i, <><path d="M3 17c2 0 2-1.5 4.5-1.5S10 17 12 17s2.5-1.5 4.5-1.5S19 17 21 17" /><path d="M3 21c2 0 2-1.5 4.5-1.5S10 21 12 21s2.5-1.5 4.5-1.5S19 21 21 21" /><path d="M8 14V5a2 2 0 0 1 4 0M16 14V5" /></>],
  [/sauna|vapor/i, <><path d="M8 4c0 2 2 2 2 4s-2 2-2 4M12 4c0 2 2 2 2 4s-2 2-2 4M16 4c0 2 2 2 2 4s-2 2-2 4" /><path d="M4 18h16M6 21h12" /></>],
  [/ar[- ]?cond|climatiz/i, <><rect x="3" y="5" width="18" height="8" rx="2" /><path d="M7 17c0 1.5 1 2 1 3M12 17v3M17 17c0 1.5-1 2-1 3" /></>],
  [/\btv\b|televis|smart|netflix|polegadas/i, <><rect x="3" y="5" width="18" height="12" rx="2" /><path d="M8 21h8" /></>],
  [/wi-?fi|internet/i, <><path d="M2.5 9a14 14 0 0 1 19 0M5.5 12.5a9.5 9.5 0 0 1 13 0M8.5 16a5 5 0 0 1 7 0" /><circle cx="12" cy="19" r="1" /></>],
  [/som|caixa de som|bluetooth|m[uú]sica/i, <><path d="M4 9v6h4l5 4V5L8 9H4Z" /><path d="M16.5 8.5a5 5 0 0 1 0 7M19 6a8.5 8.5 0 0 1 0 12" /></>],
  [/frigobar|geladeira|minibar/i, <><rect x="6" y="3" width="12" height="18" rx="2" /><path d="M6 10h12M9 6v2M9 13v3" /></>],
  [/garagem|estacion|vaga/i, <><path d="M4 21V10l8-6 8 6v11" /><path d="M8 21v-6h8v6" /></>],
  [/cama|king|queen|redonda/i, <><path d="M3 18v-6a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2v6M3 18h18M3 21v-3M21 21v-3" /><path d="M6 10V7a2 2 0 0 1 2-2h8a2 2 0 0 1 2 2v3" /></>],
  [/pole|dan[cç]a|palco/i, <><path d="M12 2v20" /><circle cx="12" cy="20" r="2" /></>],
  [/espelho/i, <><ellipse cx="12" cy="10" rx="6" ry="8" /><path d="M10 21h4" /></>],
  [/chuveiro|ducha|banho/i, <><path d="M4 4h7a5 5 0 0 1 5 5" /><path d="M13 13l1 2M16 12l1.5 2M10 14l.5 2.5" /></>],
];

export function ItemIcon({ item }: { item: string }) {
  const hit = RULES.find(([re]) => re.test(item));
  return (
    <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      {hit ? hit[1] : <path d="m5 12 5 5 9-10" />}
    </svg>
  );
}
