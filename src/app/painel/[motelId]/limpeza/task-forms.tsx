"use client";

import { useState } from "react";
import { Hidden, Msg, useKeyedForm } from "@/components/app/keyed-form";
import { CONDITION_LABEL, TASK_LABEL, type Condition, type TaskStatus } from "@/lib/housekeeping";
import { cancelTask, finishTask, requestCleaning, resolveTask, startTask } from "./actions";

export type TaskView = {
  id: string;
  suiteNumber: string;
  suiteType: string;
  status: TaskStatus;
  origin: "saida" | "pedido";
  when: string; // "Saída às 14:20" ou "Pedida às 09:10"
  notes: string | null;
  condition: Condition | null;
  kit: string[]; // "2 × Toalha de banho"
};
export type ItemOption = { id: string; name: string; unit: string };

export function TaskCard({
  motelId,
  task,
  items,
  isDesk,
}: {
  motelId: string;
  task: TaskView;
  items: ItemOption[];
  isDesk: boolean;
}) {
  const [finishing, setFinishing] = useState(false);
  const start = useKeyedForm(startTask);
  const cancel = useKeyedForm(cancelTask, { confirm: `Cancelar a limpeza da suíte ${task.suiteNumber}?` });
  const msg = start.state ?? cancel.state;

  return (
    <li className={`hk-card hk-${task.status}`}>
      <div className="hk-head">
        <div>
          <h3>Suíte {task.suiteNumber}</h3>
          <p className="res-meta">
            {task.suiteType} · {task.when}
            {task.origin === "pedido" ? " · pedida pela recepção" : ""}
          </p>
        </div>
        <span className={`hk-pill p-${task.status}`}>{TASK_LABEL[task.status]}</span>
      </div>
      {task.notes && <p className="hk-notes">“{task.notes}”</p>}

      {task.status === "problema" ? (
        isDesk ? <ResolveForm motelId={motelId} taskId={task.id} /> : <p className="res-hint">A recepção ou o proprietário precisa resolver para liberar a suíte.</p>
      ) : finishing ? (
        <FinishForm motelId={motelId} task={task} items={items} onCancel={() => setFinishing(false)} />
      ) : (
        <div className="hk-actions">
          {task.status === "aguardando" && (
            <form onSubmit={start.onSubmit}>
              <Hidden motelId={motelId} extra={{ taskId: task.id }} />
              <button type="submit" className="btn-ghost" disabled={start.pending}>
                ▶ Iniciar limpeza
              </button>
            </form>
          )}
          <button type="button" className="btn-primary compact" onClick={() => setFinishing(true)}>
            ✓ Liberar suíte
          </button>
          {isDesk && (
            <form onSubmit={cancel.onSubmit}>
              <Hidden motelId={motelId} extra={{ taskId: task.id }} />
              <button type="submit" className="btn-link small" disabled={cancel.pending}>
                Cancelar
              </button>
            </form>
          )}
        </div>
      )}
      <Msg state={msg} />
    </li>
  );
}

function FinishForm({ motelId, task, items, onCancel }: { motelId: string; task: TaskView; items: ItemOption[]; onCancel: () => void }) {
  const [condition, setCondition] = useState<Condition>("ok");
  const [usedItems, setUsedItems] = useState(false);
  const { state, onSubmit, pending } = useKeyedForm(finishTask);

  return (
    <form onSubmit={onSubmit} className="hk-finish">
      <Hidden motelId={motelId} extra={{ taskId: task.id, condition }} />

      <fieldset className="hk-block">
        <legend>Frigobar e itens consumidos</legend>
        <label className="hk-switch">
          <input type="checkbox" checked={usedItems} onChange={(e) => setUsedItems(e.target.checked)} />
          <span>Algum item foi consumido?</span>
        </label>
        {usedItems &&
          (items.length === 0 ? (
            <p className="res-hint">Nenhum item com preço de venda cadastrado no estoque.</p>
          ) : (
            <ul className="hk-items">
              {items.map((i) => (
                <li key={i.id}>
                  <span>{i.name}</span>
                  <input
                    name={`item_${i.id}`}
                    className="text-input"
                    inputMode="decimal"
                    placeholder="0"
                    maxLength={6}
                    aria-label={`Quantidade consumida de ${i.name}`}
                  />
                </li>
              ))}
            </ul>
          ))}
      </fieldset>

      <fieldset className="hk-block">
        <legend>Reposição</legend>
        {task.kit.length === 0 ? (
          <p className="res-hint">Esta suíte não tem kit padrão cadastrado (o proprietário define em Suítes).</p>
        ) : (
          <label className="hk-switch">
            <input type="checkbox" name="restock" defaultChecked />
            <span>
              Repus o kit padrão: {task.kit.join(", ")}
            </span>
          </label>
        )}
      </fieldset>

      <fieldset className="hk-block">
        <legend>Estado da suíte</legend>
        <div className="hk-conditions" role="radiogroup">
          {(["ok", "observacoes", "problema"] as Condition[]).map((c) => (
            <button
              key={c}
              type="button"
              role="radio"
              aria-checked={condition === c}
              className={`hk-cond c-${c} ${condition === c ? "on" : ""}`}
              onClick={() => setCondition(c)}
            >
              {CONDITION_LABEL[c]}
            </button>
          ))}
        </div>
        {condition !== "ok" && (
          <textarea
            name="notes"
            className="text-input"
            rows={2}
            required
            minLength={3}
            maxLength={1000}
            placeholder={condition === "problema" ? "Ex.: chuveiro sem água quente" : "Ex.: controle da TV sem pilha"}
            aria-label="Descrição"
          />
        )}
      </fieldset>

      <Msg state={state} />
      <div className="form-actions">
        <button type="button" className="secondary" onClick={onCancel}>
          Voltar
        </button>
        <button type="submit" className="btn-primary compact" disabled={pending}>
          {pending ? "Salvando..." : condition === "problema" ? "Registrar problema" : "Liberar suíte"}
        </button>
      </div>
    </form>
  );
}

function ResolveForm({ motelId, taskId }: { motelId: string; taskId: string }) {
  const { state, onSubmit, pending } = useKeyedForm(resolveTask);
  return (
    <form onSubmit={onSubmit} className="hk-resolve">
      <Hidden motelId={motelId} extra={{ taskId }} />
      <input name="resolution" className="text-input" placeholder="O que foi feito? Ex.: técnico consertou" required minLength={3} maxLength={1000} aria-label="O que foi feito" />
      <button type="submit" className="btn-primary compact" disabled={pending}>
        Resolver e liberar
      </button>
      <Msg state={state} />
    </form>
  );
}

export function RequestCleaning({ motelId, suites }: { motelId: string; suites: { id: string; number: string }[] }) {
  const { state, onSubmit, pending, formRef } = useKeyedForm(requestCleaning, { reset: true });
  if (suites.length === 0) return null;
  return (
    <form ref={formRef} onSubmit={onSubmit} className="hk-request">
      <Hidden motelId={motelId} />
      <label className="field">
        <span>Pedir limpeza</span>
        <select name="suiteId" className="select" required defaultValue="">
          <option value="">Suíte…</option>
          {suites.map((s) => (
            <option key={s.id} value={s.id}>
              Suíte {s.number}
            </option>
          ))}
        </select>
      </label>
      <input name="notes" className="text-input" placeholder="Observação (opcional)" maxLength={1000} aria-label="Observação" />
      <button type="submit" className="btn-ghost" disabled={pending}>
        Pedir
      </button>
      <Msg state={state} />
    </form>
  );
}
