"use client";

import { useState } from "react";
import { Hidden, Msg, useKeyedForm } from "@/components/app/keyed-form";
import { formatCents } from "@/lib/periods";
import { formatQty } from "@/lib/stock";
import { addCharge, reverseCharge } from "./bill-actions";

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

const SOURCE_LABEL = { recepcao: "recepção", camareira: "informado pela camareira", estorno: "estorno" };

export function ReservationBill({
  motelId,
  reservationId,
  stayCents,
  charges,
  saleItems,
  isOwner,
  canAdd,
}: {
  motelId: string;
  reservationId: string;
  stayCents: number;
  charges: ChargeView[];
  saleItems: SaleItem[];
  isOwner: boolean;
  canAdd: boolean;
}) {
  const [open, setOpen] = useState(false);
  const [other, setOther] = useState(false);
  const { state: addState, onSubmit: addSubmit, pending: addPending, formRef: addRef } = useKeyedForm(addCharge, { reset: true });
  const extras = charges.reduce((s, c) => s + c.totalCents, 0);

  return (
    <div className="bill">
      <button type="button" className="bill-toggle" aria-expanded={open} onClick={() => setOpen((v) => !v)}>
        <span>Conta da hospedagem</span>
        <strong>{formatCents(stayCents + extras)}</strong>
        <small>{charges.length ? `${charges.length} lançamento${charges.length === 1 ? "" : "s"}` : "sem consumo"}</small>
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
        </div>
      )}
    </div>
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
