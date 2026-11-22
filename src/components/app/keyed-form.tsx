"use client";

import { startTransition, useActionState, useRef } from "react";

export type FormResult = { error?: string; success?: string; savedAt?: number } | undefined;
type Action = (prev: FormResult, fd: FormData) => Promise<FormResult>;

export function Msg({ state }: { state: FormResult }) {
  if (state?.error) return <p className="alert error" role="alert">{state.error}</p>;
  if (state?.success) return <p className="alert ok" role="status">{state.success}</p>;
  return null;
}

export function newKey(): string {
  if (typeof crypto.randomUUID === "function") return crypto.randomUUID();
  // navegadores sem randomUUID (ex.: endereco http da rede local)
  const b = crypto.getRandomValues(new Uint8Array(16));
  b[6] = (b[6] & 0x0f) | 0x40;
  b[8] = (b[8] & 0x3f) | 0x80;
  const h = Array.from(b, (x) => x.toString(16).padStart(2, "0")).join("");
  return `${h.slice(0, 8)}-${h.slice(8, 12)}-${h.slice(12, 16)}-${h.slice(16, 20)}-${h.slice(20)}`;
}

/**
 * Formulario que nao e limpo pelo React em caso de erro, e que envia uma
 * chave anti-duplicidade ("key"): a mesma tentativa (clique duplo, rede
 * lenta) usa a mesma chave e o banco lanca uma vez so. Depois de um
 * sucesso, a proxima tentativa ganha chave nova.
 */
export function useKeyedForm(action: Action, opts: { reset?: boolean; confirm?: string; onSuccess?: () => void } = {}) {
  const formRef = useRef<HTMLFormElement>(null);
  const keyRef = useRef<string | null>(null);
  const [state, run, pending] = useActionState(async (prev: FormResult, fd: FormData) => {
    const result = await action(prev, fd);
    if (result?.success) {
      keyRef.current = null;
      if (opts.reset) formRef.current?.reset();
      opts.onSuccess?.();
    }
    return result;
  }, undefined);

  const onSubmit = (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (opts.confirm && !window.confirm(opts.confirm)) return;
    if (!keyRef.current) keyRef.current = newKey();
    const fd = new FormData(event.currentTarget);
    fd.set("key", keyRef.current);
    startTransition(() => run(fd));
  };
  return { state, onSubmit, pending, formRef };
}

export function Hidden({ motelId, extra }: { motelId: string; extra?: Record<string, string> }) {
  return (
    <>
      <input type="hidden" name="motelId" value={motelId} />
      {extra && Object.entries(extra).map(([k, v]) => <input key={k} type="hidden" name={k} value={v} />)}
    </>
  );
}
