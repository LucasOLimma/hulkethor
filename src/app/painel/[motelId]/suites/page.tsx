import Link from "next/link";
import { notFound } from "next/navigation";
import { readPrices } from "@/lib/periods";
import { requireMotel } from "@/lib/motel-access";
import { PageHeader } from "@/components/app/page-header";
import { NewSuite, SuiteCard, type CategoryOption, type Suite } from "./suite-forms";
import { SuiteCategories, type KitProduct, type SuiteCategory } from "./category-forms";
import { photoUrl } from "@/lib/suite-photos";
import type { PhotoView } from "./photo-manager";

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

  // categorias de suite e kits (05_operacao.sql). Sem o arquivo rodado, a tela
  // continua como antes (sem categorias).
  const [catsR, linksR, kitsR, prodR] = await Promise.all([
    ctx.supabase.from("suite_categories").select("id, name").eq("motel_id", ctx.motel.id).order("name"),
    ctx.supabase.from("suites").select("id, category_id").eq("motel_id", ctx.motel.id),
    ctx.supabase.from("suite_category_kits").select("category_id, product_id, qty").eq("motel_id", ctx.motel.id),
    ctx.isOwner
      ? ctx.supabase.from("products").select("id, name, unit, kind, active").eq("motel_id", ctx.motel.id).order("name")
      : Promise.resolve({ data: [] as { id: string; name: string; unit: string; kind: string; active: boolean }[], error: null }),
  ]);
  const hasCategories = !catsR.error && !linksR.error;
  const catOptions: CategoryOption[] | undefined = hasCategories
    ? (catsR.data ?? []).map((c) => ({ id: c.id as string, name: c.name as string }))
    : undefined;
  if (hasCategories) {
    const link = new Map((linksR.data ?? []).map((l) => [l.id as string, (l.category_id as string | null) ?? null]));
    for (const s of suites) s.categoryId = link.get(s.id) ?? null;
  }
  const allProducts = (prodR.data ?? []) as { id: string; name: string; unit: string; kind: string; active: boolean }[];
  const kitProducts: KitProduct[] = allProducts
    .filter((p) => p.active)
    .map((p) => ({ id: p.id, name: p.name, unit: p.unit, kind: p.kind as KitProduct["kind"] }));
  const prodById = new Map(allProducts.map((p) => [p.id, p]));
  const suiteCategories: SuiteCategory[] = (catOptions ?? []).map((c) => ({
    id: c.id,
    name: c.name,
    suiteNumbers: suites.filter((s) => s.categoryId === c.id).map((s) => s.number),
    kit: (kitsR.data ?? [])
      .filter((k) => k.category_id === c.id && prodById.has(k.product_id as string))
      .map((k) => {
        const p = prodById.get(k.product_id as string)!;
        return { productId: p.id, name: p.name, unit: p.unit, qty: Number(k.qty), kind: p.kind as KitProduct["kind"] };
      }),
  }));

  // fotos (07_portal_cliente.sql): so o dono gerencia
  const photosR = ctx.isOwner
    ? await ctx.supabase.from("suite_photos").select("id, suite_id, path, position, created_at").eq("motel_id", ctx.motel.id).order("position").order("created_at")
    : null;
  const photosOn = Boolean(photosR && !photosR.error);
  const photosBy = new Map<string, PhotoView[]>();
  for (const ph of photosR?.data ?? []) {
    const arr = photosBy.get(ph.suite_id as string) ?? [];
    arr.push({ id: ph.id as string, url: photoUrl(ph.path as string) });
    photosBy.set(ph.suite_id as string, arr);
  }

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
        {ctx.isOwner && <NewSuite motelId={ctx.motel.id} categories={catOptions} />}

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
              <SuiteCard
                key={s.id}
                motelId={ctx.motel.id}
                suite={s}
                canEdit={ctx.isOwner}
                categories={catOptions}
                photos={photosOn ? (photosBy.get(s.id) ?? []) : undefined}
              />
            ))}
          </ul>
        )}
      </div>
      {ctx.isOwner && catOptions && (
        <SuiteCategories motelId={ctx.motel.id} categories={suiteCategories} products={kitProducts} />
      )}
    </>
  );
}
