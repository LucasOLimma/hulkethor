import Link from "next/link";
import { notFound } from "next/navigation";
import { readPrices } from "@/lib/periods";
import { requireMotel } from "@/lib/motel-access";
import { PageHeader } from "@/components/app/page-header";
import { NewSuite, SuiteCard, type Suite } from "./suite-forms";

export const dynamic = "force-dynamic";

export default async function SuitesPage({ params }: { params: Promise<{ motelId: string }> }) {
  const { motelId } = await params;

  // Confere no banco se a pessoa e membro ativo DESTE motel.
  const ctx = await requireMotel(motelId);
  if (!ctx) notFound();

  // RLS (suites_select) + filtro explicito pelo motel conferido acima.
  const { data: rows, error } = await ctx.supabase
    .from("suites")
    .select("id, number, type, prices_cents, items, active")
    .eq("motel_id", ctx.motel.id);

  const suites: Suite[] = (rows ?? [])
    .map((r) => ({
      id: r.id as string,
      number: r.number as string,
      type: r.type as string,
      prices: readPrices(r.prices_cents),
      items: Array.isArray(r.items) ? (r.items as string[]) : [],
      active: Boolean(r.active),
    }))
    .sort((a, b) => a.number.localeCompare(b.number, "pt-BR", { numeric: true }));

  const activeCount = suites.filter((s) => s.active).length;

  return (
    <>
      <PageHeader
        title="Suítes"
        subtitle={`${activeCount} ativa${activeCount === 1 ? "" : "s"} de ${suites.length} cadastrada${suites.length === 1 ? "" : "s"}`}
        actions={
          <Link href="/demo/suite-3d" className="btn-ghost">
            Ver suíte demonstrativa em 3D
          </Link>
        }
      />
      <div className="content-card">
        {ctx.isOwner && <NewSuite motelId={ctx.motel.id} />}

        {error ? (
          <p className="alert error" role="alert">
            Não foi possível carregar as suítes agora. Tente novamente.
          </p>
        ) : suites.length === 0 ? (
          <p className="empty">
            {ctx.isOwner
              ? "Nenhuma suíte cadastrada ainda. Use “Nova suíte” para começar."
              : "Nenhuma suíte cadastrada ainda."}
          </p>
        ) : (
          <ul className="suite-list">
            {suites.map((s) => (
              <SuiteCard key={s.id} motelId={ctx.motel.id} suite={s} canEdit={ctx.isOwner} />
            ))}
          </ul>
        )}
      </div>
    </>
  );
}
