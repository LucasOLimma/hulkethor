import { notFound } from "next/navigation";
import { requireMotel } from "@/lib/motel-access";
import { isMissingTable } from "@/lib/stock";
import type { Board } from "@/lib/board";
import { PageHeader } from "@/components/app/page-header";
import { LiveBoard } from "./live-board";

export const dynamic = "force-dynamic";

export default async function MapaPage({ params }: { params: Promise<{ motelId: string }> }) {
  const { motelId } = await params;
  const ctx = await requireMotel(motelId);
  if (!ctx) notFound();
  const { data, error } = await ctx.supabase.rpc("suite_board", { p_motel: ctx.motel.id });

  if (isMissingTable(error)) {
    return (
      <>
        <PageHeader title="Mapa ao vivo" />
        <div className="content-card coming-soon">
          <span className="coming-soon-badge">Falta ativar</span>
          <h2>O mapa ao vivo ainda não foi ativado no banco</h2>
          <p>
            {ctx.isOwner
              ? "Rode o arquivo supabase/08_mapa_ao_vivo.sql no SQL Editor do Supabase e recarregue esta página."
              : "Peça ao proprietário para ativar o mapa ao vivo."}
          </p>
        </div>
      </>
    );
  }

  return (
    <>
      <PageHeader
        title="Mapa ao vivo"
        subtitle="Situação de cada suíte agora e quando cada uma deve ficar pronta. Atualiza sozinho."
      />
      {error || !data ? (
        <p className="alert error" role="alert">Não foi possível carregar o mapa agora. Tente novamente.</p>
      ) : (
        <LiveBoard motelId={ctx.motel.id} initial={data as Board} showForecast={ctx.role !== "camareira"} />
      )}
    </>
  );
}
