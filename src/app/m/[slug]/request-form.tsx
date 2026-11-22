"use client";

import Link from "next/link";
import { startTransition, useActionState, useEffect, useState } from "react";
import { formatCents, PERIOD_LABEL, PERIODS, type Period, type PricesCents } from "@/lib/periods";
import { checkoutLabel } from "@/lib/reservations";
import { loadAvailability, requestReservation, type RequestState } from "./actions";

export type PublicSuite = { id: string; number: string; type: string; items: string[]; prices: PricesCents; photos: string[] };

const dayLabel = (iso: string) => iso.split("-").reverse().join("/");

export function SuiteRequest({
  slug,
  suite,
  today,
  maxDate,
  withPhone,
}: {
  slug: string;
  suite: PublicSuite;
  today: string;
  maxDate: string;
  /** 07_portal_cliente.sql rodado: pede o celular (para a Minha Reserva) */
  withPhone: boolean;
}) {
  const offered = PERIODS.filter((p) => suite.prices[p] !== undefined);
  const [open, setOpen] = useState(false);
  const [period, setPeriod] = useState<Period>(offered[0] ?? "3h");
  const [date, setDate] = useState(today);
  const [time, setTime] = useState("");
  const [state, action, pending] = useActionState<RequestState, FormData>(requestReservation, undefined);
  // horarios ja ocupados nesse dia (so os intervalos; nada de dados de hospedes)
  const [busy, setBusy] = useState<{ date: string; list: { start: string; end: string }[] } | null>(null);
  useEffect(() => {
    if (!open || !date) return;
    let alive = true;
    loadAvailability(slug, suite.id, date).then((list) => {
      if (alive) setBusy(list ? { date, list } : null);
    });
    return () => {
      alive = false;
    };
  }, [open, date, slug, suite.id]);

  if (state?.code) {
    return (
      <div className="public-done" role="status">
        <p className="public-done-title">Pedido enviado!</p>
        <p>
          Seu código é <strong className="public-code">{state.code}</strong>
        </p>
        <p className="public-done-text">
          Suíte {suite.number} · {dayLabel(date)} às {time} · {PERIOD_LABEL[period]}. O motel vai confirmar sua reserva.
          Guarde o código e apresente na recepção.
        </p>
        {withPhone && (
          <Link href={`/m/${slug}/minha-reserva?codigo=${state.code}`} className="btn-ghost public-track">
            Acompanhar em Minha Reserva
          </Link>
        )}
      </div>
    );
  }

  if (!open) {
    return (
      <button type="button" className="btn-gold public-cta" onClick={() => setOpen(true)} disabled={offered.length === 0}>
        Solicitar reserva
      </button>
    );
  }

  return (
    <form
      className="public-form"
      onSubmit={(e) => {
        e.preventDefault();
        const fd = new FormData(e.currentTarget);
        startTransition(() => action(fd));
      }}
    >
      {state?.error && (
        <p className="alert error" role="alert">
          {state.error}
        </p>
      )}
      <input type="hidden" name="slug" value={slug} />
      <input type="hidden" name="suiteId" value={suite.id} />
      {/* armadilha para robos: invisivel para pessoas */}
      <input type="text" name="website" tabIndex={-1} autoComplete="off" className="hp-field" aria-hidden="true" />

      <div className="public-form-grid">
        <label className="field">
          <span>Data</span>
          <input type="date" name="date" className="text-input" value={date} min={today} max={maxDate} onChange={(e) => setDate(e.target.value)} required />
        </label>
        <label className="field">
          <span>Chegada</span>
          <input type="time" name="time" className="text-input" value={time} onChange={(e) => setTime(e.target.value)} required />
        </label>
        <label className="field full">
          <span>Período</span>
          <select name="period" className="select" value={period} onChange={(e) => setPeriod(e.target.value as Period)}>
            {offered.map((p) => (
              <option key={p} value={p}>
                {PERIOD_LABEL[p]} · {formatCents(suite.prices[p]!)}
              </option>
            ))}
          </select>
        </label>
        {withPhone && (
          <label className="field full">
            <span>Celular com DDD</span>
            <input
              name="phone"
              type="tel"
              inputMode="tel"
              className="text-input"
              maxLength={20}
              placeholder="(11) 98765-4321"
              autoComplete="tel-national"
              required
            />
            <small className="public-hint">Só para você consultar ou cancelar a reserva com o código.</small>
          </label>
        )}
        <label className="field full">
          <span>Nome (opcional)</span>
          <input name="guest" className="text-input" maxLength={80} placeholder="Como prefere ser chamado" autoComplete="given-name" />
        </label>
      </div>

      {busy && busy.date === date && (
        <p className="public-busy">
          {busy.list.length === 0 ? (
            <>Nenhum horário reservado nessa suíte em {dayLabel(date)}.</>
          ) : (
            <>
              Já reservado em {dayLabel(date)}:{" "}
              {busy.list.map((b) => `${b.start}–${b.end}`).join(", ")} <small>(inclui o tempo de limpeza)</small>
            </>
          )}
        </p>
      )}

      {time && (
        <p className="res-hint">
          Saída prevista: <strong>{checkoutLabel(date, time, period)}</strong> · Total: <strong>{formatCents(suite.prices[period]!)}</strong>
        </p>
      )}

      <label className="check">
        <input type="checkbox" name="adult" required />
        <span>Confirmo que todos os hóspedes são maiores de 18 anos.</span>
      </label>
      <label className="check">
        <input type="checkbox" name="terms" required />
        <span>
          Concordo com o uso dos meus dados apenas para esta reserva{withPhone ? " (o celular serve só para consultar ou cancelar pelo código)" : ""}.
        </span>
      </label>

      <div className="form-actions">
        <button type="button" className="secondary" onClick={() => setOpen(false)}>
          Voltar
        </button>
        <button type="submit" className="btn-gold" disabled={pending}>
          {pending ? "Enviando..." : "Enviar pedido"}
        </button>
      </div>
    </form>
  );
}
