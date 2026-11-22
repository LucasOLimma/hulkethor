import { notFound } from "next/navigation";
import { can, requireMotel } from "@/lib/motel-access";
import { ComingSoon, PageHeader } from "@/components/app/page-header";

export const dynamic = "force-dynamic";

export default async function Page({ params }: { params: Promise<{ motelId: string }> }) {
  const { motelId } = await params;
  const ctx = await requireMotel(motelId);
  if (!ctx || !can(ctx.role).reports) notFound();
  return (
    <>
      <PageHeader title="Relatórios" />
      <ComingSoon
        title="Relatórios deste estabelecimento"
        text="Relatórios detalhados e exportação chegam numa próxima etapa. Os indicadores principais já estão no Dashboard."
      />
    </>
  );
}
