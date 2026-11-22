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
    { href: `${base}/limpeza`, label: "Limpeza", icon: "limpeza" },
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
  // + suites aguardando limpeza / com problema (05_operacao.sql; sem ele, nada).
  const [{ data: alertRows }, { data: taskRows }, { data: suiteRows }] = await Promise.all([
    ctx.supabase.rpc("stock_alerts", { p_motel: ctx.motel.id }),
    ctx.supabase.from("housekeeping_tasks").select("id, suite_id, status").eq("motel_id", ctx.motel.id).in("status", ["aguardando", "problema"]),
    ctx.supabase.from("suites").select("id, number").eq("motel_id", ctx.motel.id),
  ]);
  const suiteNumber = new Map((suiteRows ?? []).map((s) => [s.id as string, s.number as string]));
  const taskNotices: Notice[] = (taskRows ?? []).map((t) => ({
    id: `hk-${t.id}`,
    title: t.status === "problema" ? `Suíte ${suiteNumber.get(t.suite_id as string) ?? ""} com problema` : `Suíte ${suiteNumber.get(t.suite_id as string) ?? ""} aguardando limpeza`,
    text: t.status === "problema" ? "Bloqueada até alguém resolver." : "Já pode ser limpa.",
    href: `${base}/limpeza`,
    tone: t.status === "problema" ? "bad" : "warn",
  }));
  const stockNotices: Notice[] = readAlerts(alertRows).map((a, i) => ({
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
  const notices = [...taskNotices, ...stockNotices];

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
