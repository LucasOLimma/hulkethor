import { notFound } from "next/navigation";
import { createAdminClient } from "@/lib/supabase/admin";
import { PageHeader } from "@/components/app/page-header";
import { requireOwner, ROLE_LABEL, ROLES, isRole, type Role } from "@/app/painel/equipe/team";
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

  // So o dono ativo DESTE motel entra (has_role conferido no banco).
  const owner = await requireOwner(motelId);
  if (!owner) notFound();

  const { data: rows, error } = await owner.supabase
    .from("motel_members")
    .select("user_id, role, active, created_at")
    .eq("motel_id", motelId)
    .order("created_at", { ascending: true });

  // E-mails ficam numa area so de administrador: buscamos apenas os das
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
    <>
      <PageHeader title="Equipe" subtitle="Quem acessa este estabelecimento e com qual perfil." />
      <div className="content-card">
        <section className="section first">
          <h2 className="section-title">Convidar pessoa</h2>
          <p className="section-help">A pessoa recebe um e-mail com um link para criar a própria senha.</p>
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
    </>
  );
}
