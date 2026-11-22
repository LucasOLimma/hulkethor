import type { Metadata } from "next";
import Image from "next/image";
import { notFound } from "next/navigation";
import { cache } from "react";
import { createClient } from "@/lib/supabase/server";
import { todayIn, addDays } from "@/lib/dashboard-data";
import { formatCents, PERIOD_LABEL, PERIODS, readPrices } from "@/lib/periods";
import { BRAND } from "@/lib/brand";
import { SuiteRequest, type PublicSuite } from "./request-form";

export const dynamic = "force-dynamic";

type PublicMotel = {
  name: string;
  slug: string;
  address: string | null;
  timezone: string;
  suites: { id: string; number: string; type: string; prices_cents: unknown; items: string[] | null }[];
};

// Le pela funcao publica do banco (so dados do motel e suites ATIVAS;
// nada de hospedes). Visitantes nao tem acesso direto as tabelas.
const loadMotel = cache(async (slug: string): Promise<PublicMotel | null> => {
  if (!/^[a-z0-9-]{3,40}$/.test(slug)) return null;
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("public_motel_page", { p_slug: slug });
  if (error || !data) return null;
  return data as PublicMotel;
});

export async function generateMetadata({ params }: { params: Promise<{ slug: string }> }): Promise<Metadata> {
  const motel = await loadMotel((await params).slug);
  return { title: motel ? `${motel.name} · Suítes e reservas` : "Motel não encontrado" };
}

export default async function PublicMotelPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const motel = await loadMotel(slug);
  if (!motel) notFound();

  const today = todayIn(motel.timezone);
  const suites: PublicSuite[] = motel.suites.map((s) => ({
    id: s.id,
    number: s.number,
    type: s.type,
    items: s.items ?? [],
    prices: readPrices(s.prices_cents),
  }));

  return (
    <div className="public-page">
      <header className="public-hero">
        <Image src="/login/suite.jpg" alt="" fill priority sizes="100vw" className="public-hero-img" />
        <div className="public-hero-shade" />
        <div className="public-hero-text">
          <p className="public-eyebrow">Suítes e reservas</p>
          <h1>{motel.name}</h1>
          {motel.address && <p className="public-address">{motel.address}</p>}
          <a href="#suites" className="btn-gold">
            Ver suítes e reservar
          </a>
        </div>
      </header>

      <main className="public-main" id="suites">
        <h2 className="public-section-title">Nossas suítes</h2>
        <p className="public-section-sub">
          Escolha a suíte, a data e o horário. Seu pedido é enviado ao motel, que confirma a reserva.
        </p>

        {suites.length === 0 ? (
          <p className="empty">Nenhuma suíte disponível para reserva no momento.</p>
        ) : (
          <ul className="public-suites">
            {suites.map((s) => {
              const offered = PERIODS.filter((p) => s.prices[p] !== undefined);
              return (
                <li key={s.id} className="public-suite">
                  <div className="public-suite-cover" aria-hidden="true">
                    <span>{s.number}</span>
                  </div>
                  <div className="public-suite-body">
                    <h3>Suíte {s.number}</h3>
                    <p className="public-suite-type">{s.type}</p>
                    {s.items.length > 0 && (
                      <ul className="public-items">
                        {s.items.map((it) => (
                          <li key={it}>{it}</li>
                        ))}
                      </ul>
                    )}
                    <dl className="public-prices">
                      {offered.map((p) => (
                        <div key={p}>
                          <dt>{PERIOD_LABEL[p]}</dt>
                          <dd>{formatCents(s.prices[p]!)}</dd>
                        </div>
                      ))}
                    </dl>
                    <SuiteRequest slug={motel.slug} suite={s} today={today} maxDate={addDays(today, 60)} />
                  </div>
                </li>
              );
            })}
          </ul>
        )}

        <p className="public-legal">
          Somente para maiores de 18 anos. Os dados informados são usados apenas para a sua reserva.
        </p>
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
