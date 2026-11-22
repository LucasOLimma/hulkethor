import { notFound } from "next/navigation";
import { can, requireMotel } from "@/lib/motel-access";
import { ComingSoon, PageHeader } from "@/components/app/page-header";

export const dynamic = "force-dynamic";

export default async function Page({ params }: { params: Promise<{ motelId: string }> }) {
  const { motelId } = await params;
  const ctx = await requireMotel(motelId);
  if (!ctx || !can(ctx.role).reservations) notFound();
  return (
    <>
      <PageHeader title="Clientes" />
      <ComingSoon
        title="Clientes deste estabelecimento"
        text="O banco ainda não tem cadastro de clientes (as reservas guardam só o nome do hóspede). Esta área chega junto com o cadastro de clientes."
      />
    </>
  );
}
