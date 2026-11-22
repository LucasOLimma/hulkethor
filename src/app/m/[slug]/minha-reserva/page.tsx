import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { BRAND } from "@/lib/brand";
import { MyReservationForm } from "./my-reservation";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "Minha Reserva", robots: { index: false } };

export default async function MinhaReservaPage({
  params,
  searchParams,
}: {
  params: Promise<{ slug: string }>;
  searchParams: Promise<{ codigo?: string }>;
}) {
  const { slug } = await params;
  const sp = await searchParams;
  if (!/^[a-z0-9-]{3,40}$/.test(slug)) notFound();
  const supabase = await createClient();
  const { data } = await supabase.rpc("public_motel_page", { p_slug: slug });
  const motel = data as { name: string; slug: string; cancel_hours?: number } | null;
  if (!motel) notFound();
  const portal = typeof motel.cancel_hours === "number";
  const code = (sp.codigo ?? "").toUpperCase().replace(/[^A-Z0-9]/g, "").slice(0, 6);

  return (
    <div className="public-page">
      <main className="public-main my-res">
        <Link href={`/m/${motel.slug}`} className="my-res-back">← {motel.name}</Link>
        <h1 className="public-section-title">Minha Reserva</h1>
        {portal ? (
          <>
            <p className="public-section-sub">
              Consulte a situação do seu pedido com o <strong>código</strong> e o <strong>celular</strong> informados na reserva.
            </p>
            <MyReservationForm slug={motel.slug} initialCode={code} />
          </>
        ) : (
          <p className="public-section-sub">A consulta de reservas pelo site ainda não está disponível neste motel. Fale com a recepção.</p>
        )}
      </main>
      <footer className="public-footer">
        <span>
          Reservas por {BRAND.first}
          <em>{BRAND.second}</em>
        </span>
      </footer>
    </div>
  );
}
