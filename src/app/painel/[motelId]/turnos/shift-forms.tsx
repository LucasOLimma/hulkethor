"use client";

import { useState } from "react";
import { Hidden, Msg, useKeyedForm } from "@/components/app/keyed-form";
import { addCashMovement, addChecklistItem, closeShift, openShift, removeChecklistItem } from "./actions";

export type ChecklistItem = { id: string; label: string };

export function OpenShiftForm({ motelId, items }: { motelId: string; items: ChecklistItem[] }) {
  const [checked, setChecked] = useState<Set<string>>(new Set());
  const { state, onSubmit, pending } = useKeyedForm(openShift);
  const all = items.every((i) => checked.has(i.id));
  const toggle = (id: string) =>
    setChecked((cur) => {
      const n = new Set(cur);
      if (n.has(id)) n.delete(id);
      else n.add(id);
      return n;
    });

  return (
    <form onSubmit={onSubmit} className="shift-open">
      <Hidden motelId={motelId} />
      <ul className="checklist">
        {items.map((i) => (
          <li key={i.id}>
            <label className={checked.has(i.id) ? "on" : undefined}>
              <span>{i.label}</span>
              <input type="checkbox" name="check" value={i.id} checked={checked.has(i.id)} onChange={() => toggle(i.id)} />
            </label>
          </li>
        ))}
      </ul>
      <div className="form-grid stock-grid">
        <label className="field">
          <span>Fundo de caixa contado agora</span>
          <div className="money">
            <span>R$</span>
            <input name="float" className="text-input" inputMode="decimal" placeholder="0,00" required maxLength={15} />
          </div>
        </label>
        <label className="field">
          <span>Observações da abertura (opcional)</span>
          <input name="notes" className="text-input" maxLength={2000} />
        </label>
      </div>
      <Msg state={state} />
      <div className="shift-open-foot">
        <p className="res-hint">Ao confirmar, o turno é aberto em seu nome e a conferência fica registrada.</p>
        <button type="submit" className="btn-primary compact" disabled={pending || !all}>
          {pending ? "Abrindo..." : all ? "✓ Confirmar abertura" : `Confira os ${items.length - checked.size} itens restantes`}
        </button>
      </div>
    </form>
  );
}

export function CashMovementForm({ motelId }: { motelId: string }) {
  const { state, onSubmit, pending, formRef } = useKeyedForm(addCashMovement, { reset: true });
  return (
    <form ref={formRef} onSubmit={onSubmit} className="stock-inline cash-form">
      <Hidden motelId={motelId} />
      <select name="type" className="select" defaultValue="sangria" aria-label="Tipo">
        <option value="sangria">Sangria (retirada)</option>
        <option value="suprimento">Suprimento (entrada)</option>
      </select>
      <div className="money">
        <span>R$</span>
        <input name="amount" className="text-input bill-price" inputMode="decimal" placeholder="0,00" required maxLength={15} aria-label="Valor" />
      </div>
      <input name="reason" className="text-input" placeholder="Motivo (ex.: depósito no banco)" required minLength={3} maxLength={300} aria-label="Motivo" />
      <button type="submit" className="btn-ghost" disabled={pending}>Registrar</button>
      <Msg state={state} />
    </form>
  );
}

export function CloseShiftForm({ motelId, shiftId }: { motelId: string; shiftId: string }) {
  const [open, setOpen] = useState(false);
  const { state, onSubmit, pending } = useKeyedForm(closeShift, {
    confirm: "Fechar o turno? Depois de fechado, ele não pode ser reaberto.",
  });
  if (!open)
    return (
      <button type="button" className="btn-ghost" onClick={() => setOpen(true)}>
        🔒 Fechar turno
      </button>
    );
  return (
    <form onSubmit={onSubmit} className="res-form stock-form shift-close">
      <Hidden motelId={motelId} extra={{ shiftId }} />
      <label className="field">
        <span>Dinheiro contado no caixa agora</span>
        <div className="money">
          <span>R$</span>
          <input name="counted" className="text-input" inputMode="decimal" placeholder="0,00" required maxLength={15} />
        </div>
      </label>
      <label className="field">
        <span>Passagem de plantão (para a próxima equipe)</span>
        <textarea name="handover" className="text-input" rows={3} maxLength={2000} placeholder="Ex.: suíte 102 com hóspede até 16h; ar da 101 fazendo barulho" />
      </label>
      <Msg state={state} />
      <div className="form-actions">
        <button type="button" className="secondary" onClick={() => setOpen(false)}>Voltar</button>
        <button type="submit" className="btn-primary compact" disabled={pending}>
          {pending ? "Fechando..." : "Fechar turno"}
        </button>
      </div>
    </form>
  );
}

export function ChecklistEditor({ motelId, items }: { motelId: string; items: ChecklistItem[] }) {
  const { state: addState, onSubmit: addSubmit, pending: addPending, formRef: addRef } = useKeyedForm(addChecklistItem, { reset: true });
  const remove = useKeyedForm(removeChecklistItem);
  return (
    <div className="checklist-editor">
      <ul className="stock-rows">
        {items.map((i) => (
          <li key={i.id} className="stock-row">
            <span>{i.label}</span>
            <form onSubmit={remove.onSubmit}>
              <Hidden motelId={motelId} extra={{ id: i.id }} />
              <button type="submit" className="btn-link small" disabled={remove.pending || items.length <= 1}>
                Remover
              </button>
            </form>
          </li>
        ))}
      </ul>
      <form ref={addRef} onSubmit={addSubmit} className="stock-inline">
        <Hidden motelId={motelId} />
        <input name="label" className="text-input" placeholder="Novo item da conferência" required minLength={3} maxLength={120} aria-label="Novo item" />
        <button type="submit" className="btn-ghost" disabled={addPending}>Adicionar</button>
      </form>
      <Msg state={addState ?? remove.state} />
    </div>
  );
}
