import { notFound } from "next/navigation";
import { requireMotel, ROLE_LABEL } from "@/lib/motel-access";
import { PageHeader } from "@/components/app/page-header";

export const dynamic = "force-dynamic";

export default async function MeuMotelPage({ params }: { params: Promise<{ motelId: string }> }) {
  const { motelId } = await params;
  const ctx = await requireMotel(motelId);
  if (!ctx) notFound();

  const { data: m, error } = await ctx.supabase
    .from("motels")
    .select("name, slug, cnpj, address, timezone, created_at")
    .eq("id", ctx.motel.id)
    .maybeSingle();

  return (
    <>
      <PageHeader
        title="Meu Motel"
        subtitle="Dados cadastrais do estabelecimento."
        actions={
          <a href={`/m/${ctx.motel.slug}`} className="btn-ghost" target="_blank" rel="noopener">
            Ver página pública ↗
          </a>
        }
      />
      <div className="content-card">
        {error || !m ? (
          <p className="alert error" role="alert">Não foi possível carregar os dados agora.</p>
        ) : (
          <dl className="info-list">
            <div><dt>Nome</dt><dd>{m.name}</dd></div>
            <div><dt>Identificador (endereço público)</dt><dd className="mono">{m.slug}</dd></div>
            <div><dt>CNPJ</dt><dd>{m.cnpj || "Não informado"}</dd></div>
            <div><dt>Endereço</dt><dd>{m.address || "Não informado"}</dd></div>
            <div><dt>Fuso horário</dt><dd>{m.timezone}</dd></div>
            <div><dt>Cadastrado em</dt><dd>{new Date(m.created_at as string).toLocaleDateString("pt-BR")}</dd></div>
            <div><dt>Seu perfil</dt><dd>{ROLE_LABEL[ctx.role]}</dd></div>
          </dl>
        )}
      </div>
    </>
  );
}
