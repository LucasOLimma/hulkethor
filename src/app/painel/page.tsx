import Link from "next/link";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { signOut } from "@/app/auth-actions";

// Nao guardar esta pagina em cache: cada pessoa ve so os seus dados.
export const dynamic = "force-dynamic";

// Valores aceitos pela coluna motel_members.role (ver supabase/01_base_multi_motel.sql)
const ROLE_LABEL: Record<string, string> = {
  dono: "Dono",
  recepcao: "Recepção",
  camareira: "Camareira",
};

type Vinculo = { motelId: string; motelName: string; role: string };

export default async function PainelPage() {
  const supabase = await createClient();

  // getUser() confirma com o servidor do Supabase quem esta logado.
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  // Busca os vinculos ATIVOS da pessoa logada, com o nome do motel.
  // O banco (RLS) so devolve a propria linha e motels dos quais ela e membro.
  const { data, error } = await supabase
    .from("motel_members")
    .select("motel_id, role, motels ( name )")
    .eq("user_id", user.id)
    .eq("active", true);

  const vinculos: Vinculo[] = (data ?? []).map((row) => {
    const motel = Array.isArray(row.motels) ? row.motels[0] : row.motels;
    return {
      motelId: row.motel_id as string,
      motelName: (motel as { name?: string } | null)?.name ?? "—",
      role: row.role as string,
    };
  });

  return (
    <main className="page">
      <div className="card wide">
        <div className="topbar">
          <div>
            <h1>Painel</h1>
            <p className="subtitle">{user.email}</p>
          </div>
          <form action={signOut}>
            <button type="submit" className="secondary">
              Sair
            </button>
          </form>
        </div>

        {error ? (
          <p className="alert error" role="alert">
            Não foi possível carregar seus dados agora. Tente novamente.
          </p>
        ) : vinculos.length === 0 ? (
          <p className="alert error" role="alert">
            Sua conta não está vinculada a nenhum motel. Fale com o responsável.
          </p>
        ) : (
          <ul className="motel-list">
            {vinculos.map((v) => (
              <li key={v.motelId}>
                <span className="motel-name">{v.motelName}</span>
                <span className="member-actions">
                  <span className="badge">{ROLE_LABEL[v.role] ?? v.role}</span>
                  <Link href={`/painel/suites/${v.motelId}`} className="btn-link">
                    Suítes →
                  </Link>
                  {v.role === "dono" && (
                    <Link href={`/painel/equipe/${v.motelId}`} className="btn-link">
                      Equipe →
                    </Link>
                  )}
                </span>
              </li>
            ))}
          </ul>
        )}
      </div>
    </main>
  );
}
