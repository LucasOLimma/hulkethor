import { notFound } from "next/navigation";
import { can, getMyMotels, requireMotel } from "@/lib/motel-access";
import { AppShell, type NavItem, type Notice } from "@/components/app/app-shell";
import { ALERT_LABEL, LOCATION_LABEL, formatDateBR, formatQty, readAlerts } from "@/lib/stock";

export const dynamic = "force-dynamic";

// Moldura do painel de UM estabelecimento: menu lateral + cabecalho.
// O acesso e conferido no banco aqui E em cada pagina (o layout sozinho
// nao basta como seguranca).
export default async function MotelLayout({
  children,
  params,
}: {
  children: React.ReactNode;
  params: Promise<{ motelId: string }>;
}) {
  const { motelId } = await params;
  const ctx = await requireMotel(motelId);
  if (!ctx) notFound();

  const motels = await getMyMotels();
  const perm = can(ctx.role);
  const base = `/painel/${ctx.motel.id}`;

  const nav: NavItem[] = [
    { href: base, label: "Dashboard", icon: "dashboard", exact: true },
    { href: `${base}/suites`, label: "Suítes", icon: "suites" },
    ...(perm.reservations
      ? ([
          { href: `${base}/reservas`, label: "Reservas", icon: "reservas" },
          { href: `${base}/clientes`, label: "Clientes", icon: "clientes" },
        ] as NavItem[])
      : []),
    { href: `${base}/estoque`, label: "Estoque", icon: "estoque" },
    ...(perm.team ? ([{ href: `${base}/equipe`, label: "Equipe", icon: "equipe" }] as NavItem[]) : []),
    ...(perm.reports
      ? ([
          { href: `${base}/promocoes`, label: "Promoções", icon: "promocoes" },
          { href: `${base}/relatorios`, label: "Relatórios", icon: "relatorios" },
        ] as NavItem[])
      : []),
    { href: `${base}/configuracoes`, label: "Configurações", icon: "configuracoes" },
    { href: `${base}/meu-motel`, label: "Meu Motel", icon: "motel" },
  ];

  // Sininho: alertas reais do estoque (abaixo do minimo, negativo, validade).
  // Se o 04_estoque.sql ainda nao foi rodado, a funcao nao existe: sem avisos.
  const { data: alertRows } = await ctx.supabase.rpc("stock_alerts", { p_motel: ctx.motel.id });
  const notices: Notice[] = readAlerts(alertRows).map((a, i) => ({
    id: `${a.kind}-${a.productId}-${i}`,
    title: `${ALERT_LABEL[a.kind]}: ${a.productName}`,
    text:
      a.kind === "negativo"
        ? `${LOCATION_LABEL[a.location]}: ${formatQty(a.qty, a.unit)}`
        : a.kind === "abaixo_minimo"
          ? `${formatQty(a.qty, a.unit)} no estoque (mínimo ${formatQty(a.minQty, a.unit)})`
          : `${formatQty(a.qty, a.unit)}${a.lotCode ? `, lote ${a.lotCode}` : ""}: ${a.kind === "vencido" ? "venceu" : "vence"} em ${formatDateBR(a.expiresOn!)}`,
    href: `${base}/estoque`,
    tone: a.kind === "negativo" || a.kind === "vencido" ? "bad" : "warn",
  }));

  return (
    <AppShell
      notices={notices}
      motel={{ id: ctx.motel.id, name: ctx.motel.name, role: ctx.role }}
      motels={motels.map((m) => ({ id: m.id, name: m.name, role: m.role }))}
      email={ctx.user.email ?? ""}
      nav={nav}
    >
      {/* key = motel: ao trocar de estabelecimento, tudo que esta na tela e
          recriado do zero (nenhum formulario/mensagem do motel anterior fica). */}
      <div key={ctx.motel.id} className="app-content">
        {children}
      </div>
    </AppShell>
  );
}
