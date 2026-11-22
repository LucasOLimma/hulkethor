import { notFound } from "next/navigation";
import { requireMotel } from "@/lib/motel-access";
import { PageHeader } from "@/components/app/page-header";
import { CancelHoursForm } from "./cancel-form";

export const dynamic = "force-dynamic";

const PRIVACY: Record<string, string> = {
  code_only: "Só o código da reserva",
  first_name: "Primeiro nome",
  full_name: "Nome completo",
};

export default async function ConfiguracoesPage({ params }: { params: Promise<{ motelId: string }> }) {
  const { motelId } = await params;
  const ctx = await requireMotel(motelId);
  if (!ctx) notFound();

  // RLS settings_select: membros do motel leem; filtro explicito pelo motel conferido.
  const { data: s, error } = await ctx.supabase
    .from("motel_settings")
    .select("smart_arrival_enabled, max_share_minutes, approach_threshold_minutes, arrival_radius_m, privacy_mode, retention_hours")
    .eq("motel_id", ctx.motel.id)
    .maybeSingle();

  // prazo de cancelamento pelo cliente (07_portal_cliente.sql; sem ele, nao aparece)
  const { data: c, error: cErr } = await ctx.supabase
    .from("motel_settings")
    .select("client_cancel_hours")
    .eq("motel_id", ctx.motel.id)
    .maybeSingle();
  const cancelHours = !cErr && c ? Number(c.client_cancel_hours) : null;

  return (
    <>
      <PageHeader title="Configurações" subtitle="Valores atuais deste estabelecimento." />
      {cancelHours !== null && (
        <div className="content-card">
          <h2 className="card-title">Reservas pelo site</h2>
          {ctx.isOwner ? (
            <CancelHoursForm motelId={ctx.motel.id} hours={cancelHours} />
          ) : (
            <p>O cliente pode cancelar pelo site até {cancelHours} h antes da chegada.</p>
          )}
        </div>
      )}
      <div className="content-card">
        {error ? (
          <p className="alert error" role="alert">Não foi possível carregar as configurações agora.</p>
        ) : !s ? (
          <p className="empty">Este estabelecimento ainda não tem configurações registradas.</p>
        ) : (
          <dl className="info-list">
            <div><dt>Chegada inteligente</dt><dd>{s.smart_arrival_enabled ? "Ativada" : "Desativada"}</dd></div>
            <div><dt>Tempo máximo de compartilhamento de localização</dt><dd>{s.max_share_minutes} min</dd></div>
            <div><dt>Aviso de aproximação</dt><dd>{s.approach_threshold_minutes} min antes</dd></div>
            <div><dt>Raio de chegada</dt><dd>{s.arrival_radius_m} m</dd></div>
            <div><dt>Privacidade do hóspede</dt><dd>{PRIVACY[s.privacy_mode as string] ?? s.privacy_mode}</dd></div>
            <div><dt>Retenção de dados</dt><dd>{s.retention_hours} h</dd></div>
          </dl>
        )}
      </div>
    </>
  );
}
