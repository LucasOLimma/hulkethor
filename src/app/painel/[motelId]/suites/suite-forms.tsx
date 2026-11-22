"use client";

import { startTransition, useActionState, useRef, useState } from "react";
import {
  centsToInput,
  formatCents,
  PERIOD_LABEL,
  PERIODS,
  type PricesCents,
} from "@/lib/periods";
import { deleteSuite, saveSuite, setSuiteActive, type SuiteState } from "@/app/painel/suites/actions";

export type Suite = {
  id: string;
  number: string;
  type: string;
  prices: PricesCents;
  items: string[];
  active: boolean;
};

function Message({ state }: { state: SuiteState }) {
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

// Envia sem o React limpar o formulario (para nao perder o que foi digitado em caso de erro).
function submitWith(action: (fd: FormData) => void, confirmText?: string) {
  return (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (confirmText && !window.confirm(confirmText)) return;
    const formData = new FormData(event.currentTarget);
    startTransition(() => action(formData));
  };
}

// ---------- Formulario (nova suite ou edicao) ----------
function SuiteForm({
  motelId,
  suite,
  onDone,
}: {
  motelId: string;
  suite?: Suite;
  onDone?: () => void;
}) {
  const formRef = useRef<HTMLFormElement>(null);
  const [state, action, pending] = useActionState(async (prev: SuiteState, fd: FormData) => {
    const result = await saveSuite(prev, fd);
    if (result?.success) {
      if (suite) onDone?.(); // edicao: fecha o formulario
      else formRef.current?.reset(); // nova suite: limpa os campos e mostra a mensagem
    }
    return result;
  }, undefined);

  return (
    <form ref={formRef} onSubmit={submitWith(action)} className="suite-form">
      <Message state={state} />
      <input type="hidden" name="motelId" value={motelId} />
      <input type="hidden" name="suiteId" value={suite?.id ?? ""} />

      <div className="form-grid two">
        <label className="field">
          <span>Número</span>
          <input
            name="number"
            className="text-input"
            defaultValue={suite?.number}
            placeholder="Ex.: 12"
            required
            maxLength={20}
          />
        </label>
        <label className="field">
          <span>Tipo</span>
          <input
            name="type"
            className="text-input"
            defaultValue={suite?.type}
            placeholder="Ex.: Luxo com hidro"
            required
            maxLength={60}
          />
        </label>
      </div>

      <fieldset className="prices">
        <legend>Preços (deixe vazio o período que a suíte não oferece)</legend>
        <div className="form-grid four">
          {PERIODS.map((p) => (
            <label key={p} className="field">
              <span>{PERIOD_LABEL[p]}</span>
              <div className="money">
                <span>R$</span>
                <input
                  name={`price_${p}`}
                  className="text-input"
                  inputMode="decimal"
                  defaultValue={centsToInput(suite?.prices[p])}
                  placeholder="0,00"
                  maxLength={15}
                />
              </div>
            </label>
          ))}
        </div>
      </fieldset>

      <label className="field">
        <span>Itens (separe por vírgula)</span>
        <input
          name="items"
          className="text-input"
          defaultValue={suite?.items.join(", ")}
          placeholder="Ex.: Hidromassagem, Sauna, Ar-condicionado, Frigobar"
          maxLength={2000}
        />
      </label>

      <div className="form-actions">
        {onDone && suite && (
          <button type="button" className="secondary" onClick={onDone}>
            Cancelar
          </button>
        )}
        <button type="submit" className="btn-primary compact" disabled={pending}>
          {pending ? "Salvando..." : suite ? "Salvar alterações" : "Criar suíte"}
        </button>
      </div>
    </form>
  );
}

// ---------- Caixa "Nova suite" (so o dono ve) ----------
export function NewSuite({ motelId }: { motelId: string }) {
  const [open, setOpen] = useState(false);

  if (!open) {
    return (
      <button type="button" className="btn-primary compact new-suite-btn" onClick={() => setOpen(true)}>
        + Nova suíte
      </button>
    );
  }
  return (
    <section className="panel-box">
      <div className="panel-box-head">
        <h2 className="section-title">Nova suíte</h2>
        <button type="button" className="secondary" onClick={() => setOpen(false)}>
          Fechar
        </button>
      </div>
      <SuiteForm motelId={motelId} />
    </section>
  );
}

// ---------- Cartao de cada suite ----------
export function SuiteCard({
  motelId,
  suite,
  canEdit,
}: {
  motelId: string;
  suite: Suite;
  canEdit: boolean;
}) {
  const [editing, setEditing] = useState(false);
  const [activeState, activeAction, activePending] = useActionState(setSuiteActive, undefined);
  const [deleteState, deleteAction, deletePending] = useActionState(deleteSuite, undefined);

  if (editing) {
    return (
      <li className="suite editing">
        <h3 className="suite-title">Editando suíte {suite.number}</h3>
        <SuiteForm motelId={motelId} suite={suite} onDone={() => setEditing(false)} />
      </li>
    );
  }

  const offered = PERIODS.filter((p) => suite.prices[p] !== undefined);

  return (
    <li className={suite.active ? "suite" : "suite inactive"}>
      <div className="suite-head">
        <div>
          <h3 className="suite-title">Suíte {suite.number}</h3>
          <p className="suite-type">{suite.type}</p>
        </div>
        {!suite.active && <span className="badge muted">Desativada</span>}
      </div>

      <dl className="price-grid">
        {offered.map((p) => (
          <div key={p}>
            <dt>{PERIOD_LABEL[p]}</dt>
            <dd>{formatCents(suite.prices[p]!)}</dd>
          </div>
        ))}
      </dl>

      {suite.items.length > 0 && (
        <ul className="chips">
          {suite.items.map((i) => (
            <li key={i}>{i}</li>
          ))}
        </ul>
      )}

      {canEdit && (
        <div className="suite-actions">
          <button type="button" className="secondary" onClick={() => setEditing(true)}>
            Editar
          </button>
          <form onSubmit={submitWith(activeAction)}>
            <input type="hidden" name="motelId" value={motelId} />
            <input type="hidden" name="suiteId" value={suite.id} />
            <input type="hidden" name="active" value={suite.active ? "false" : "true"} />
            <button type="submit" className="secondary" disabled={activePending}>
              {activePending ? "..." : suite.active ? "Desativar" : "Ativar"}
            </button>
          </form>
          <form
            onSubmit={submitWith(
              deleteAction,
              `Excluir a suíte ${suite.number}? Isso não pode ser desfeito.`,
            )}
          >
            <input type="hidden" name="motelId" value={motelId} />
            <input type="hidden" name="suiteId" value={suite.id} />
            <button type="submit" className="secondary danger" disabled={deletePending}>
              {deletePending ? "..." : "Excluir"}
            </button>
          </form>
        </div>
      )}

      <div className="member-msg">
        <Message state={activeState} />
        <Message state={deleteState} />
      </div>
    </li>
  );
}
