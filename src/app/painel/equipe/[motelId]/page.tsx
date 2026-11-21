import Link from "next/link";
import { notFound } from "next/navigation";
import { createAdminClient } from "@/lib/supabase/admin";
import { requireOwner, ROLE_LABEL, ROLES, isRole, type Role } from "../team";
import { InviteForm, MemberRow } from "./team-forms";

export const dynamic = "force-dynamic";

type Member = {
  userId: string;
  email: string;
  role: Role;
  active: boolean;
  isMe: boolean;
};

export default async function TeamPage({ params }: { params: Promise<{ motelId: string }> }) {
  const { motelId } = await params;

  // So o dono ativo deste motel entra. Para qualquer outra pessoa,
  // a pagina simplesmente "nao existe".
  const owner = await requireOwner(motelId);
  if (!owner) notFound();

  // Nome do motel e lista da equipe: lidos com a chave publica,
  // o banco (RLS) so devolve o que o dono pode ver.
  const [{ data: motel }, { data: rows, error }] = await Promise.all([
    owner.supabase.from("motels").select("name").eq("id", motelId).single(),
    owner.supabase
      .from("motel_members")
      .select("user_id, role, active, created_at")
      .eq("motel_id", motelId)
      .order("created_at", { ascending: true }),
  ]);

  // E-mails: ficam numa area so de administrador. Buscamos apenas os das
  // pessoas que o banco acabou de confirmar que sao deste motel.
  const admin = createAdminClient();
  const members: Member[] = await Promise.all(
    (rows ?? []).map(async (row) => {
      const { data } = await admin.auth.admin.getUserById(row.user_id as string);
      return {
        userId: row.user_id as string,
        email: data?.user?.email ?? "(e-mail indisponível)",
        role: (isRole(row.role) ? row.role : "camareira") as Role,
        active: Boolean(row.active),
        isMe: row.user_id === owner.userId,
      };
    }),
  );

  const roleOptions = ROLES.map((r) => ({ value: r, label: ROLE_LABEL[r] }));

  return (
    <main className="page top">
      <div className="card wide">
        <p className="breadcrumb">
          <Link href="/painel" className="small-link">
            ← Voltar ao painel
          </Link>
        </p>
        <h1>Equipe</h1>
        <p className="subtitle">{motel?.name ?? "Motel"}</p>

        <section className="section">
          <h2 className="section-title">Convidar pessoa</h2>
          <p className="section-help">
            A pessoa recebe um e-mail com um link para criar a própria senha.
          </p>
          <InviteForm motelId={motelId} roleOptions={roleOptions} />
        </section>

        <section className="section">
          <h2 className="section-title">Pessoas ({members.length})</h2>
          {error ? (
            <p className="alert error" role="alert">
              Não foi possível carregar a equipe agora. Tente novamente.
            </p>
          ) : (
            <ul className="member-list">
              {members.map((m) => (
                <MemberRow
                  key={m.userId}
                  motelId={motelId}
                  member={m}
                  roleOptions={roleOptions}
                  roleLabel={ROLE_LABEL[m.role]}
                />
              ))}
            </ul>
          )}
        </section>
      </div>
    </main>
  );
}
