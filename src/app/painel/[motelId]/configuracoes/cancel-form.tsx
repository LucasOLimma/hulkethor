"use client";

import { startTransition, useActionState } from "react";
import { saveCancelHours, type SettingsState } from "./actions";

export function CancelHoursForm({ motelId, hours }: { motelId: string; hours: number }) {
  const [state, action, pending] = useActionState<SettingsState, FormData>(saveCancelHours, undefined);
  return (
    <form
      className="stock-inline cancel-form"
      onSubmit={(e) => {
        e.preventDefault();
        const fd = new FormData(e.currentTarget);
        startTransition(() => action(fd));
      }}
    >
      <input type="hidden" name="motelId" value={motelId} />
      <label className="field">
        <span>Cliente pode cancelar pelo site até</span>
        <div className="money">
          <input name="hours" className="text-input cat-qty" inputMode="numeric" defaultValue={String(hours)} maxLength={2} required aria-label="Horas antes da chegada" />
          <span>horas antes da chegada</span>
        </div>
      </label>
      <button type="submit" className="btn-ghost" disabled={pending}>Salvar</button>
      {state?.error && <p className="alert error" role="alert">{state.error}</p>}
      {state?.success && <p className="alert ok" role="status">{state.success}</p>}
    </form>
  );
}
