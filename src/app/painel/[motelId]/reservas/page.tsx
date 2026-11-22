import { notFound } from "next/navigation";
import { can, requireMotel } from "@/lib/motel-access";
import { STATUS_LABEL } from "@/lib/dashboard-data";
import { formatCents, PERIOD_LABEL, type Period } from "@/lib/periods";
import { PageHeader } from "@/components/app/page-header";

export const dynamic = "force-dynamic";

const dayLabel = (iso: string) => `${iso.slice(8, 10)}/${iso.slice(5, 7)}/${iso.slice(0, 4)}`;

export default async function ReservasPage({ params }: { params: Promise<{ motelId: string }> }) {
  const { motelId } = await params;
  const ctx = await requireMotel(motelId);
  // camareira nao ve dados de hospedes (mesma regra do banco)
  if (!ctx || !can(ctx.role).reservations) notFound();

  const [{ data: rows, error }, { data: suites }] = await Promise.all([
    ctx.supabase
      .from("reservations")
      .select("id, code, guest_name, stay_date, period, arrival_time, total_cents, status, suite_id")
      .eq("motel_id", ctx.motel.id)
      .order("stay_date", { ascending: false })
      .order("arrival_time", { ascending: false })
      .limit(100),
    ctx.supabase.from("suites").select("id, number").eq("motel_id", ctx.motel.id),
  ]);
  const suiteNumber = new Map((suites ?? []).map((s) => [s.id as string, s.number as string]));

  return (
    <>
      <PageHeader title="Reservas" subtitle="As 100 reservas mais recentes deste estabelecimento." />
      <div className="content-card">
        {error ? (
          <p className="alert error" role="alert">Não foi possível carregar as reservas agora.</p>
        ) : !rows?.length ? (
          <p className="empty">Nenhuma reserva registrada ainda.</p>
        ) : (
          <div className="table-wrap">
            <table className="data-table">
              <thead>
                <tr>
                  <th scope="col">Código</th>
                  <th scope="col">Data</th>
                  <th scope="col">Suíte</th>
                  <th scope="col">Período</th>
                  <th scope="col">Hóspede</th>
                  <th scope="col" className="num">Valor</th>
                  <th scope="col">Situação</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((r) => (
                  <tr key={r.id as string}>
                    <td className="mono">{r.code as string}</td>
                    <td>
                      {dayLabel(r.stay_date as string)}
                      {r.arrival_time ? ` · ${(r.arrival_time as string).slice(0, 5)}` : ""}
                    </td>
                    <td>{suiteNumber.get(r.suite_id as string) ?? "—"}</td>
                    <td>{PERIOD_LABEL[r.period as Period] ?? (r.period as string)}</td>
                    <td>{(r.guest_name as string) || "—"}</td>
                    <td className="num">{formatCents(r.total_cents as number)}</td>
                    <td>
                      <span className={`pill pill-${r.status as string}`}>
                        {STATUS_LABEL[r.status as string] ?? (r.status as string)}
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </>
  );
}
