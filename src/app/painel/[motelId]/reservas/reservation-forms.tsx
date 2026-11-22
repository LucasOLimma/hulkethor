"use client";

import { startTransition, useActionState, useState } from "react";
import { centsToInput, formatCents, PERIOD_LABEL, PERIODS, type Period, type PricesCents } from "@/lib/periods";
import { checkoutLabel, STATUS_LABEL, TRANSITIONS, type ReservationStatus } from "@/lib/reservations";
import { changeReservationStatus, createReservation, updateReservation, type ReservationState } from "./actions";

export type SuiteOption = { id: string; number: string; type: string; active: boolean; prices: PricesCents };
export type ReservationView = {
  id: string;
  code: string;
  guest: string;
  date: string;
  time: string;
  period: Period;
  totalCents: number;
  decoration: string;
  status: ReservationStatus;
  suiteId: string;
  suiteNumber: string;
};

const dayLabel = (iso: string) => iso.split("-").reverse().join("/");

function Message({ state }: { state: ReservationState }) {
  if (state?.error)
    return (
      <p className="alert error" role="alert">
        {state.error}
      </p>
    );
  if (state?.success)
    return (
      <p className="alert ok" role="status">
        {state.success}
      </p>
    );
  return null;
}

// Envia sem o React limpar o formulario (para nao perder o que foi digitado).
function submitWith(action: (fd: FormData) => void, confirmText?: string) {
  return (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    if (confirmText && !window.confirm(confirmText)) return;
    const fd = new FormData(e.currentTarget);
    startTransition(() => action(fd));
  };
}

// ---------- formulario (nova reserva ou edicao) ----------
function ReservationForm({
  motelId,
  suites,
  today,
  maxDate,
  initial,
  onSuccess,
  onCancel,
}: {
  motelId: string;
  suites: SuiteOption[];
  today: string;
  maxDate: string;
  initial?: ReservationView;
  onSuccess: (msg: string) => void;
  onCancel?: () => void;
}) {
  const editing = Boolean(initial);
  const [suiteId, setSuiteId] = useState(initial?.suiteId ?? suites[0]?.id ?? "");
  const suite = suites.find((s) => s.id === suiteId);
  const offered = PERIODS.filter((p) => suite?.prices[p] !== undefined);
  const [periodRaw, setPeriod] = useState<Period>(initial?.period ?? "3h");
  const period: Period = offered.includes(periodRaw) ? periodRaw : (offered[0] ?? "3h");
  const [date, setDate] = useState(initial?.date ?? today);
  const [time, setTime] = useState(initial?.time ?? "");
  // valor: segue o preco da suite ate a pessoa digitar outro
  const [typedTotal, setTypedTotal] = useState<string | null>(initial ? centsToInput(initial.totalCents) : null);
  const suggested = centsToInput(suite?.prices[period]);
  const total = typedTotal ?? suggested;

  const [state, action, pending] = useActionState(async (prev: ReservationState, fd: FormData) => {
    const res = await (editing ? updateReservation : createReservation)(prev, fd);
    if (res?.success) onSuccess(res.success);
    return res;
  }, undefined);

  if (suites.length === 0) {
    return <p className="empty small">Cadastre e ative uma suíte antes de criar reservas.</p>;
  }

  return (
    <form onSubmit={submitWith(action)} className="res-form">
      <Message state={state} />
      <input type="hidden" name="motelId" value={motelId} />
      {initial && <input type="hidden" name="reservationId" value={initial.id} />}

      <div className="form-grid res-grid">
        <label className="field">
          <span>Suíte</span>
          <select name="suiteId" className="select" value={suiteId} onChange={(e) => setSuiteId(e.target.value)} required>
            {suites.map((s) => (
              <option key={s.id} value={s.id}>
                Suíte {s.number} · {s.type}
              </option>
            ))}
          </select>
        </label>
        <label className="field">
          <span>Data</span>
          <input type="date" name="date" className="text-input" value={date} min={today} max={maxDate} onChange={(e) => setDate(e.target.value)} required />
        </label>
        <label className="field">
          <span>Chegada</span>
          <input type="time" name="time" className="text-input" value={time} onChange={(e) => setTime(e.target.value)} required />
        </label>
        <label className="field">
          <span>Período</span>
          <select name="period" className="select" value={period} onChange={(e) => setPeriod(e.target.value as Period)} required>
            {offered.map((p) => (
              <option key={p} value={p}>
                {PERIOD_LABEL[p]} · {formatCents(suite!.prices[p]!)}
              </option>
            ))}
          </select>
        </label>
        <label className="field">
          <span>Valor (R$)</span>
          <input
            name="total"
            className="text-input"
            inputMode="decimal"
            value={total}
            onChange={(e) => setTypedTotal(e.target.value)}
            maxLength={15}
          />
        </label>
        <label className="field">
          <span>Nome do hóspede (opcional)</span>
          <input name="guest" className="text-input" defaultValue={initial?.guest} maxLength={80} placeholder="Pode ficar em branco" />
        </label>
      </div>
      <label className="field">
        <span>Decoração ou pedido especial (opcional)</span>
        <input name="decoration" className="text-input" defaultValue={initial?.decoration} maxLength={200} placeholder="Ex.: pétalas de rosa e espumante" />
      </label>

      {time && (
        <p className="res-hint">
          Saída prevista: <strong>{checkoutLabel(date, time, period)}</strong>
          {typedTotal !== null && typedTotal !== suggested && suggested && <> · preço da tabela: {formatCents(suite!.prices[period]!)}</>}
        </p>
      )}

      <label className="check">
        <input type="checkbox" name="adult" defaultChecked={editing} required />
        <span>Confirmo que os hóspedes são maiores de 18 anos.</span>
      </label>

      <div className="form-actions">
        {onCancel && (
          <button type="button" className="secondary" onClick={onCancel}>
            Cancelar
          </button>
        )}
        <button type="submit" className="btn-primary compact" disabled={pending}>
          {pending ? "Salvando..." : editing ? "Salvar alterações" : "Criar reserva"}
        </button>
      </div>
    </form>
  );
}

// ---------- caixa "Nova reserva" ----------
export function NewReservation(props: { motelId: string; suites: SuiteOption[]; today: string; maxDate: string }) {
  const [open, setOpen] = useState(false);
  const [formKey, setFormKey] = useState(0);
  const [done, setDone] = useState<string | null>(null);

  if (!open) {
    return (
      <div className="res-new-row">
        <button type="button" className="btn-gold" onClick={() => { setOpen(true); setDone(null); }}>
          + Nova reserva
        </button>
        {done && (
          <p className="alert ok" role="status">
            {done}
          </p>
        )}
      </div>
    );
  }
  return (
    <section className="panel-box">
      <div className="panel-box-head">
        <h2 className="section-title">Nova reserva</h2>
        <button type="button" className="secondary" onClick={() => setOpen(false)}>
          Fechar
        </button>
      </div>
      <ReservationForm
        key={formKey}
        {...props}
        onSuccess={(msg) => {
          setDone(msg);
          setOpen(false);
          setFormKey((k) => k + 1);
        }}
      />
    </section>
  );
}

// ---------- cada reserva da lista ----------
export function ReservationItem({
  motelId,
  r,
  suites,
  today,
  maxDate,
}: {
  motelId: string;
  r: ReservationView;
  suites: SuiteOption[];
  today: string;
  maxDate: string;
}) {
  const [editing, setEditing] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);
  const [state, action, pending] = useActionState(changeReservationStatus, undefined);

  if (editing) {
    // na edicao, a suite atual aparece mesmo se tiver sido desativada depois
    const options = suites.filter((s) => s.active || s.id === r.suiteId);
    return (
      <li className="res-item editing">
        <p className="res-edit-title">
          Editando reserva <span className="mono">{r.code}</span>
        </p>
        <ReservationForm
          motelId={motelId}
          suites={options}
          today={today < r.date ? today : r.date}
          maxDate={maxDate}
          initial={r}
          onSuccess={(m) => {
            setMsg(m);
            setEditing(false);
          }}
          onCancel={() => setEditing(false)}
        />
      </li>
    );
  }

  const transitions = TRANSITIONS[r.status];
  const when = r.date === today ? "Hoje" : dayLabel(r.date);

  return (
    <li className={`res-item st-${r.status}`}>
      <div className="res-main">
        <div className="res-when">
          <strong>{r.time || "—"}</strong>
          <span>{when}</span>
        </div>
        <div className="res-info">
          <p className="res-title">
            Suíte {r.suiteNumber} · {PERIOD_LABEL[r.period]}
            <span className={`status-pill s-${r.status}`}>{STATUS_LABEL[r.status]}</span>
          </p>
          <p className="res-meta">
            <span className="mono">{r.code}</span>
            {" · "}
            {r.guest || "Hóspede não informado"}
            {r.time && <> · saída {checkoutLabel(r.date, r.time, r.period)}</>}
          </p>
          {r.decoration && <p className="res-deco">✦ {r.decoration}</p>}
        </div>
        <strong className="res-total">{formatCents(r.totalCents)}</strong>
      </div>

      {(transitions.length > 0 || r.status === "confirmada") && (
        <div className="res-actions">
          {transitions.map((t) => (
            <form
              key={t.to}
              onSubmit={submitWith(
                action,
                t.to === "cancelada"
                  ? `Cancelar a reserva ${r.code}? Isso não pode ser desfeito.`
                  : t.to === "nao_compareceu"
                    ? `Marcar a reserva ${r.code} como "não compareceu"?`
                    : undefined,
              )}
            >
              <input type="hidden" name="motelId" value={motelId} />
              <input type="hidden" name="reservationId" value={r.id} />
              <input type="hidden" name="from" value={r.status} />
              <input type="hidden" name="to" value={t.to} />
              <button type="submit" className={t.tone === "primary" ? "btn-primary compact" : t.tone === "danger" ? "secondary danger" : "secondary"} disabled={pending}>
                {t.label}
              </button>
            </form>
          ))}
          {r.status === "confirmada" && (
            <button type="button" className="secondary" onClick={() => setEditing(true)}>
              Editar
            </button>
          )}
        </div>
      )}
      {(msg || state) && (
        <div className="res-msg">
          {msg && !state && (
            <p className="alert ok" role="status">
              {msg}
            </p>
          )}
          <Message state={state} />
        </div>
      )}
    </li>
  );
}
