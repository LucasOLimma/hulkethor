"use client";

import { useState } from "react";
import { Hidden, Msg, useKeyedForm } from "@/components/app/keyed-form";
import { formatCents } from "@/lib/periods";
import { formatQty } from "@/lib/stock";
import { addCharge, checkoutWithPayment, receivePayment, reverseCharge, reversePayment } from "./bill-actions";

export type ChargeView = {
  id: string;
  description: string;
  qty: number;
  unitPriceCents: number;
  totalCents: number;
  source: "recepcao" | "camareira" | "estorno";
  reversed: boolean;
};
export type SaleItem = { id: string; name: string; priceCents: number };
export type PaymentView = { id: string; method: string; amountCents: number; reversed: boolean };
const METHOD_LABEL: Record<string, string> = { dinheiro: "Dinheiro", pix: "Pix", credito: "Cartão de crédito", debito: "Cartão de débito" };

const SOURCE_LABEL = { recepcao: "recepção", camareira: "informado pela camareira", estorno: "estorno" };

export function ReservationBill({
  motelId,
  reservationId,
  stayCents,
  charges,
  saleItems,
  isOwner,
  canAdd,
  payments,
  payMode,
}: {
  motelId: string;
  reservationId: string;
  stayCents: number;
  charges: ChargeView[];
  saleItems: SaleItem[];
  isOwner: boolean;
  canAdd: boolean;
  /** null = caixa (06) ainda nao ativado */
  payments: PaymentView[] | null;
  /** "checkout" = reserva em andamento; "receive" = concluida */
  payMode: "checkout" | "receive";
}) {
  const [open, setOpen] = useState(false);
  const [other, setOther] = useState(false);
  const { state: addState, onSubmit: addSubmit, pending: addPending, formRef: addRef } = useKeyedForm(addCharge, { reset: true });
  const extras = charges.reduce((s, c) => s + c.totalCents, 0);
  const paid = (payments ?? []).reduce((s, p) => s + p.amountCents, 0);
  const due = stayCents + extras - paid;

  return (
    <div className="bill">
      <button type="button" className="bill-toggle" aria-expanded={open} onClick={() => setOpen((v) => !v)}>
        <span>Conta da hospedagem</span>
        <strong>{formatCents(stayCents + extras)}</strong>
        <small>
          {charges.length ? `${charges.length} lançamento${charges.length === 1 ? "" : "s"}` : "sem consumo"}
          {payments && (due > 0 ? ` · a pagar ${formatCents(due)}` : due === 0 ? " · pago" : ` · crédito ${formatCents(-due)}`)}
        </small>
        <span aria-hidden="true">{open ? "▴" : "▾"}</span>
      </button>
      {open && (
        <div className="bill-body">
          <table className="data-table bill-table">
            <tbody>
              <tr>
                <td>Hospedagem</td>
                <td />
                <td className="num">{formatCents(stayCents)}</td>
                {isOwner && <td />}
              </tr>
              {charges.map((c) => (
                <tr key={c.id} className={c.reversed ? "stock-row-reversed" : undefined}>
                  <td>
                    {c.description}
                    <small className="stock-sub">
                      {SOURCE_LABEL[c.source]}
                      {c.reversed ? " · estornado" : ""}
                    </small>
                  </td>
                  <td className="num">
                    {c.source === "estorno" ? "" : `${formatQty(c.qty)} × ${formatCents(c.unitPriceCents)}`}
                  </td>
                  <td className={`num ${c.totalCents < 0 ? "neg" : ""}`}>{formatCents(c.totalCents)}</td>
                  {isOwner && (
                    <td>{c.source !== "estorno" && !c.reversed && <ReverseCharge motelId={motelId} chargeId={c.id} />}</td>
                  )}
                </tr>
              ))}
              <tr className="bill-total">
                <td>Total</td>
                <td />
                <td className="num">{formatCents(stayCents + extras)}</td>
                {isOwner && <td />}
              </tr>
              {payments?.map((p) => (
                <tr key={p.id} className={p.reversed ? "stock-row-reversed" : undefined}>
                  <td>
                    {p.amountCents < 0 ? "Estorno de pagamento" : "Pago"} · {METHOD_LABEL[p.method]}
                    {p.reversed && <small className="stock-sub">estornado</small>}
                  </td>
                  <td />
                  <td className="num">{formatCents(-p.amountCents)}</td>
                  {isOwner && <td>{p.amountCents > 0 && !p.reversed && <ReversePayment motelId={motelId} paymentId={p.id} />}</td>}
                </tr>
              ))}
              {payments && (
                <tr className="bill-total">
                  <td>{due >= 0 ? "Saldo a pagar" : "Crédito do cliente"}</td>
                  <td />
                  <td className={`num ${due > 0 ? "warn-text" : ""}`}>{formatCents(Math.abs(due))}</td>
                  {isOwner && <td />}
                </tr>
              )}
            </tbody>
          </table>

          {canAdd && (
            <form ref={addRef} onSubmit={addSubmit} className="stock-inline bill-add">
              <Hidden motelId={motelId} extra={{ reservationId }} />
              {other ? (
                <>
                  <input name="description" className="text-input" placeholder="Item (ex.: decoração extra)" required minLength={2} maxLength={120} aria-label="Descrição" />
                  <div className="money">
                    <span>R$</span>
                    <input name="price" className="text-input bill-price" inputMode="decimal" placeholder="0,00" required maxLength={15} aria-label="Preço unitário" />
                  </div>
                </>
              ) : (
                <select name="productId" className="select" required defaultValue="" aria-label="Item">
                  <option value="">{saleItems.length ? "Item do frigobar…" : "Nenhum item com preço de venda"}</option>
                  {saleItems.map((i) => (
                    <option key={i.id} value={i.id}>
                      {i.name} · {formatCents(i.priceCents)}
                    </option>
                  ))}
                </select>
              )}
              <input name="qty" className="text-input cat-qty" inputMode="decimal" defaultValue="1" required maxLength={10} aria-label="Quantidade" />
              <button type="submit" className="btn-ghost" disabled={addPending}>Lançar</button>
              <button type="button" className="btn-link small" onClick={() => setOther((v) => !v)}>
                {other ? "Item do estoque" : "Outro item"}
              </button>
            </form>
          )}
          <Msg state={addState} />
          {payments && payMode === "receive" && due > 0 && (
            <PaymentForm motelId={motelId} reservationId={reservationId} due={due} mode="receive" />
          )}
        </div>
      )}
      {payments && payMode === "checkout" && (
        <PaymentForm motelId={motelId} reservationId={reservationId} due={due} mode="checkout" />
      )}
    </div>
  );
}

/** Formas de pagamento: pode dividir (ex.: parte Pix, parte dinheiro). */
function PaymentForm({ motelId, reservationId, due, mode }: { motelId: string; reservationId: string; due: number; mode: "checkout" | "receive" }) {
  const [open, setOpen] = useState(false);
  const [values, setValues] = useState<Record<string, string>>({});
  const { state, onSubmit, pending } = useKeyedForm(mode === "checkout" ? checkoutWithPayment : receivePayment);
  const toCents = (v: string) => {
    let s = v.replace(/\s|R\$/g, "");
    if (s.includes(",")) s = s.replace(/\./g, "").replace(",", ".");
    return /^\d+(\.\d{0,2})?$/.test(s) ? Math.round(Number(s) * 100) : 0;
  };
  const sum = Object.values(values).reduce((s, v) => s + toCents(v), 0);
  const fill = (m: string) => setValues({ [m]: (Math.max(due, 0) / 100).toFixed(2).replace(".", ",") });

  if (!open)
    return (
      <div className="pay-open">
        <button type="button" className="btn-primary compact" onClick={() => setOpen(true)}>
          {mode === "checkout" ? (due > 0 ? `Registrar saída e receber ${formatCents(due)}` : "Registrar saída") : `Receber saldo de ${formatCents(due)}`}
        </button>
        {state?.success && <Msg state={state} />}
      </div>
    );
  return (
    <form onSubmit={onSubmit} className="pay-form">
      <Hidden motelId={motelId} extra={{ reservationId }} />
      <p className="pay-due">
        {mode === "checkout" ? "Total a pagar na saída" : "Saldo a receber"}: <strong>{formatCents(Math.max(due, 0))}</strong>
      </p>
      {due > 0 && (
        <>
          <div className="pay-quick">
            {["dinheiro", "pix", "credito", "debito"].map((m) => (
              <button key={m} type="button" className="btn-link small" onClick={() => fill(m)}>
                Tudo em {METHOD_LABEL[m].replace("Cartão de ", "")}
              </button>
            ))}
          </div>
          <div className="pay-grid">
            {["dinheiro", "pix", "credito", "debito"].map((m) => (
              <label key={m} className="field">
                <span>{METHOD_LABEL[m]}</span>
                <div className="money">
                  <span>R$</span>
                  <input
                    name={`pay_${m}`}
                    className="text-input"
                    inputMode="decimal"
                    placeholder="0,00"
                    maxLength={15}
                    value={values[m] ?? ""}
                    onChange={(e) => setValues((v) => ({ ...v, [m]: e.target.value }))}
                  />
                </div>
              </label>
            ))}
          </div>
          <p className={`pay-sum ${sum === due || (mode === "receive" && sum > 0 && sum <= due) ? "ok" : ""}`}>
            Informado: {formatCents(sum)}
            {mode === "checkout" && sum !== due && ` · ${sum < due ? `faltam ${formatCents(due - sum)}` : `passou ${formatCents(sum - due)}`}`}
          </p>
        </>
      )}
      <Msg state={state} />
      <div className="form-actions">
        <button type="button" className="secondary" onClick={() => setOpen(false)}>Voltar</button>
        <button
          type="submit"
          className="btn-primary compact"
          disabled={pending || (due > 0 && (mode === "checkout" ? sum !== due : sum <= 0 || sum > due))}
        >
          {pending ? "Registrando..." : mode === "checkout" ? "Confirmar saída" : "Confirmar recebimento"}
        </button>
      </div>
    </form>
  );
}

function ReversePayment({ motelId, paymentId }: { motelId: string; paymentId: string }) {
  const [open, setOpen] = useState(false);
  const { state, onSubmit, pending } = useKeyedForm(reversePayment);
  if (!open)
    return (
      <button type="button" className="btn-link small" onClick={() => setOpen(true)}>
        Estornar
      </button>
    );
  return (
    <form onSubmit={onSubmit} className="stock-reverse">
      <Hidden motelId={motelId} extra={{ paymentId }} />
      <input name="reason" className="text-input" placeholder="Motivo" required minLength={3} maxLength={300} aria-label="Motivo do estorno do pagamento" />
      <button type="submit" className="btn-ghost" disabled={pending}>OK</button>
      <button type="button" className="btn-link small" onClick={() => setOpen(false)}>×</button>
      {state?.error && <p className="alert error" role="alert">{state.error}</p>}
    </form>
  );
}

function ReverseCharge({ motelId, chargeId }: { motelId: string; chargeId: string }) {
  const [open, setOpen] = useState(false);
  const { state, onSubmit, pending } = useKeyedForm(reverseCharge);
  if (!open)
    return (
      <button type="button" className="btn-link small" onClick={() => setOpen(true)}>
        Estornar
      </button>
    );
  return (
    <form onSubmit={onSubmit} className="stock-reverse">
      <Hidden motelId={motelId} extra={{ chargeId }} />
      <input name="reason" className="text-input" placeholder="Motivo" required minLength={3} maxLength={300} aria-label="Motivo do estorno" />
      <button type="submit" className="btn-ghost" disabled={pending}>OK</button>
      <button type="button" className="btn-link small" onClick={() => setOpen(false)}>×</button>
      {state?.error && <p className="alert error" role="alert">{state.error}</p>}
    </form>
  );
}
