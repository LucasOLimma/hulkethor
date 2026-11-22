import { notFound } from "next/navigation";
import { can, getMyMotels, requireMotel } from "@/lib/motel-access";
import { AppShell, type NavItem } from "@/components/app/app-shell";

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

  return (
    <AppShell
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
