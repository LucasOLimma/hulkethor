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
      <PageHeader title="Promoções" />
      <ComingSoon
        title="Promoções deste estabelecimento"
        text="Cupons e preços promocionais por período ainda não existem no sistema. Esta área chega numa próxima etapa."
      />
    </>
  );
}
