import Link from "next/link";
import { notFound } from "next/navigation";
import { readPrices } from "@/lib/periods";
import { getMembership } from "../access";
import { NewSuite, SuiteCard, type Suite } from "./suite-forms";

export const dynamic = "force-dynamic";

export default async function SuitesPage({ params }: { params: Promise<{ motelId: string }> }) {
  const { motelId } = await params;

  // Qualquer membro ativo do motel ve as suites; quem nao e, ve "pagina nao existe".
  const member = await getMembership(motelId);
  if (!member) notFound();

  // Lido com a chave publica: o banco (RLS suites_select) so devolve
  // suites de motel do qual a pessoa e membro.
  const [{ data: motel }, { data: rows, error }] = await Promise.all([
    member.supabase.from("motels").select("name").eq("id", motelId).single(),
    member.supabase
      .from("suites")
      .select("id, number, type, prices_cents, items, active")
      .eq("motel_id", motelId),
  ]);

  const suites: Suite[] = (rows ?? [])
    .map((r) => ({
      id: r.id as string,
      number: r.number as string,
      type: r.type as string,
      prices: readPrices(r.prices_cents),
      items: Array.isArray(r.items) ? (r.items as string[]) : [],
      active: Boolean(r.active),
    }))
    // ordena "2" antes de "10"
    .sort((a, b) => a.number.localeCompare(b.number, "pt-BR", { numeric: true }));

  const activeCount = suites.filter((s) => s.active).length;

  return (
    <main className="page top">
      <div className="card wide">
        <p className="breadcrumb">
          <Link href="/painel" className="small-link">
            ← Voltar ao painel
          </Link>
        </p>
        <h1>Suítes</h1>
        <p className="subtitle">
          {motel?.name ?? "Motel"} · {activeCount} ativa{activeCount === 1 ? "" : "s"} de{" "}
          {suites.length}
        </p>

        {member.isOwner && <NewSuite motelId={motelId} />}

        {error ? (
          <p className="alert error" role="alert">
            Não foi possível carregar as suítes agora. Tente novamente.
          </p>
        ) : suites.length === 0 ? (
          <p className="empty">
            {member.isOwner
              ? "Nenhuma suíte cadastrada ainda. Use “Nova suíte” para começar."
              : "Nenhuma suíte cadastrada ainda."}
          </p>
        ) : (
          <ul className="suite-list">
            {suites.map((s) => (
              <SuiteCard key={s.id} motelId={motelId} suite={s} canEdit={member.isOwner} />
            ))}
          </ul>
        )}
      </div>
    </main>
  );
}
