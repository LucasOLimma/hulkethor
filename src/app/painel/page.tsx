import Link from "next/link";
import { motelInitials } from "@/lib/initials";
import { redirect } from "next/navigation";
import { getMyMotels, getSessionUser, ROLE_LABEL } from "@/lib/motel-access";
import { signOut } from "@/app/auth-actions";
import { BRAND } from "@/lib/brand";
import { BrandMark } from "@/components/app/app-shell";

// Nao guardar em cache: cada pessoa ve so os seus estabelecimentos.
export const dynamic = "force-dynamic";

// =====================================================================
// MEUS ESTABELECIMENTOS — primeira tela depois do login.
// Lista so os motéis em que a pessoa e membro ATIVO (consulta no banco +
// RLS). Nao mostra faturamento/reservas: nenhum motel foi escolhido ainda.
// =====================================================================

export default async function MeusEstabelecimentos({
  searchParams,
}: {
  searchParams: Promise<{ lista?: string }>;
}) {
  const { lista } = await searchParams;
  const { supabase, user } = await getSessionUser();
  if (!user) redirect("/login");

  let motels: Awaited<ReturnType<typeof getMyMotels>> = [];
  let loadError = false;
  try {
    motels = await getMyMotels();
  } catch {
    loadError = true;
  }

  // Um estabelecimento so: vai direto ao painel dele. "?lista=1" mostra a
  // lista mesmo assim (link "Meus estabelecimentos" no painel).
  if (!loadError && motels.length === 1 && !lista) redirect(`/painel/${motels[0].id}`);

  // Quantidade de suites por motel (RLS: so de motéis em que a pessoa e membro).
  const counts = new Map<string, { total: number; active: number }>();
  if (motels.length) {
    const { data } = await supabase
      .from("suites")
      .select("motel_id, active")
      .in(
        "motel_id",
        motels.map((m) => m.id),
      );
    for (const row of data ?? []) {
      const c = counts.get(row.motel_id as string) ?? { total: 0, active: 0 };
      c.total += 1;
      if (row.active) c.active += 1;
      counts.set(row.motel_id as string, c);
    }
  }

  return (
    <div className="select-page">
      <header className="select-top">
        <span className="select-brand">
          <BrandMark size={30} />
          <span>
            {BRAND.first}
            <em>{BRAND.second}</em>
          </span>
        </span>
        <div className="select-user">
          <span className="select-email">{user.email}</span>
          <form action={signOut}>
            <button type="submit" className="btn-ghost">
              Sair
            </button>
          </form>
        </div>
      </header>

      <main className="select-main">
        <p className="select-eyebrow">Área do proprietário</p>
        <h1 className="select-title">Meus estabelecimentos</h1>
        <p className="select-subtitle">Selecione o estabelecimento que deseja administrar.</p>

        {loadError ? (
          <p className="alert error" role="alert">
            Não foi possível carregar seus estabelecimentos agora. Recarregue a página.
          </p>
        ) : motels.length === 0 ? (
          <div className="select-empty">
            <h2>Nenhum estabelecimento vinculado</h2>
            <p>
              Sua conta ainda não tem acesso a nenhum motel. Se você é proprietário, solicite o cadastro do seu
              estabelecimento ao suporte da plataforma. Se faz parte de uma equipe, peça ao responsável pelo motel
              que envie um convite para o seu e-mail.
            </p>
          </div>
        ) : (
          <ul className="motel-cards">
            {motels.map((m) => {
              const c = counts.get(m.id) ?? { total: 0, active: 0 };
              const operating = c.active > 0;
              return (
                <li key={m.id} className="motel-card">
                  <div className="motel-cover" aria-hidden="true">
                    <span className="motel-cover-initials">{motelInitials(m.name)}</span>
                    <span className="motel-cover-note">Sem foto de capa</span>
                  </div>
                  <div className="motel-card-body">
                    <div className="motel-card-head">
                      <h2>{m.name}</h2>
                      <span className="role-badge">{ROLE_LABEL[m.role]}</span>
                    </div>
                    <dl className="motel-facts">
                      <div>
                        <dt>Suítes</dt>
                        <dd>
                          {c.total}
                          {c.total > 0 && <small> · {c.active} ativas</small>}
                        </dd>
                      </div>
                      <div>
                        <dt>Situação</dt>
                        <dd className={operating ? "status-ok" : "status-pending"}>
                          <span className="status-dot" aria-hidden="true" />
                          {operating ? "Em operação" : "Configuração pendente"}
                        </dd>
                      </div>
                    </dl>
                    <Link href={`/painel/${m.id}`} className="btn-gold">
                      Acessar painel
                    </Link>
                    <div className="motel-card-links">
                      <Link href={`/painel/${m.id}/suites`}>Gerenciar suítes</Link>
                      {m.role === "dono" && <Link href={`/painel/${m.id}/equipe`}>Gerenciar equipe</Link>}
                    </div>
                  </div>
                </li>
              );
            })}
          </ul>
        )}
      </main>
    </div>
  );
}

