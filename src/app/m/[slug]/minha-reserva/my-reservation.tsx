"use client";

import { startTransition, useActionState, useState } from "react";
import { formatCents, PERIOD_LABEL, type Period } from "@/lib/periods";
import { checkoutLabel } from "@/lib/reservations";
import { cancelMyReservation, lookupReservation, type LookupState } from "../actions";

const STATUS: Record<string, { label: string; text: string }> = {
  pendente: { label: "Aguardando confirmação", text: "O motel ainda vai confirmar o seu pedido." },
  confirmada: { label: "Confirmada", text: "Sua reserva está confirmada. Apresente o código na recepção." },
  chegou: { label: "Em andamento", text: "Bem-vindos! Sua estadia está em andamento." },
  concluida: { label: "Concluída", text: "Obrigado pela visita." },
  cancelada: { label: "Cancelada", text: "Esta reserva foi cancelada." },
  nao_compareceu: { label: "Não compareceu", text: "A reserva foi encerrada porque não houve chegada." },
};
const dayLabel = (iso: string) => iso.split("-").reverse().join("/");

function submit(action: (fd: FormData) => void) {
  return (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const fd = new FormData(e.currentTarget);
    startTransition(() => action(fd));
  };
}

export function MyReservationForm({ slug, initialCode }: { slug: string; initialCode: string }) {
  const [lookup, lookupAction, lookingUp] = useActionState<LookupState, FormData>(lookupReservation, undefined);
  const [cancel, cancelAction, cancelling] = useActionState<LookupState, FormData>(cancelMyReservation, undefined);
  const [asking, setAsking] = useState(false);
  // o resultado mais recente (consulta ou cancelamento)
  const current = cancel?.reservation ? cancel : lookup;
  const r = current?.reservation;

  if (r) {
    const st = STATUS[r.status] ?? { label: r.status, text: "" };
    return (
      <section className={`my-res-card st-${r.status}`} aria-live="polite">
        {cancel?.cancelled && <p className="alert ok" role="status">Reserva cancelada. O motel já foi avisado.</p>}
        <div className="my-res-head">
          <span className="public-code">{r.code}</span>
          <span className={`status-pill s-${r.status}`}>{st.label}</span>
        </div>
        <p className="my-res-text">{st.text}</p>
        <dl className="public-prices my-res-info">
          <div><dt>Suíte</dt><dd>{r.suite_number} · {r.suite_type}</dd></div>
          <div><dt>Data</dt><dd>{dayLabel(r.stay_date)}</dd></div>
          <div><dt>Chegada</dt><dd>{r.arrival_time ?? "—"}</dd></div>
          <div><dt>Período</dt><dd>{PERIOD_LABEL[r.period as Period] ?? r.period}</dd></div>
          {r.arrival_time && (
            <div><dt>Saída prevista</dt><dd>{checkoutLabel(r.stay_date, r.arrival_time, r.period as Period)}</dd></div>
          )}
          <div><dt>Valor da hospedagem</dt><dd>{formatCents(r.total_cents)}</dd></div>
        </dl>

        {r.can_cancel && !asking && (
          <button type="button" className="secondary danger" onClick={() => setAsking(true)}>
            Cancelar reserva
          </button>
        )}
        {r.can_cancel && asking && (
          <form onSubmit={submit(cancelAction)} className="my-res-cancel">
            <input type="hidden" name="slug" value={slug} />
            <input type="hidden" name="code" value={current?.code ?? ""} />
            <input type="hidden" name="phone" value={current?.phone ?? ""} />
            <label className="check">
              <input type="checkbox" name="confirm" required />
              <span>Quero cancelar a reserva {r.code}. Sei que isso não pode ser desfeito.</span>
            </label>
            {cancel?.error && <p className="alert error" role="alert">{cancel.error}</p>}
            <div className="form-actions">
              <button type="button" className="secondary" onClick={() => setAsking(false)}>Voltar</button>
              <button type="submit" className="btn-gold" disabled={cancelling}>
                {cancelling ? "Cancelando..." : "Confirmar cancelamento"}
              </button>
            </div>
          </form>
        )}
        {!r.can_cancel && (r.status === "pendente" || r.status === "confirmada") && (
          <p className="public-hint">
            O cancelamento pelo site vai até {r.cancel_hours} h antes da chegada. Depois disso, fale com o motel.
          </p>
        )}
      </section>
    );
  }

  return (
    <form onSubmit={submit(lookupAction)} className="public-form my-res-form">
      <input type="hidden" name="slug" value={slug} />
      {lookup?.error && <p className="alert error" role="alert">{lookup.error}</p>}
      <label className="field">
        <span>Código da reserva</span>
        <input name="code" className="text-input my-res-code" defaultValue={initialCode} maxLength={8} required autoCapitalize="characters" autoComplete="off" placeholder="Ex.: K7M2QX" />
      </label>
      <label className="field">
        <span>Celular informado no pedido</span>
        <input name="phone" type="tel" inputMode="tel" className="text-input" maxLength={20} required placeholder="(11) 98765-4321" autoComplete="tel-national" />
      </label>
      <button type="submit" className="btn-gold" disabled={lookingUp}>
        {lookingUp ? "Consultando..." : "Consultar"}
      </button>
    </form>
  );
}
