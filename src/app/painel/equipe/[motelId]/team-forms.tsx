"use client";

import { startTransition, useActionState, useRef } from "react";
import { changeRole, inviteMember, setActive, type TeamState } from "../actions";

type RoleOption = { value: string; label: string };

function Message({ state }: { state: TeamState }) {
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

// Envia sem o React limpar o formulario automaticamente.
function submitWith(action: (fd: FormData) => void) {
  return (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const formData = new FormData(event.currentTarget);
    startTransition(() => action(formData));
  };
}

// ---------- Formulario de convite ----------
export function InviteForm({ motelId, roleOptions }: { motelId: string; roleOptions: RoleOption[] }) {
  const formRef = useRef<HTMLFormElement>(null);
  const [state, action, pending] = useActionState(async (prev: TeamState, fd: FormData) => {
    const result = await inviteMember(prev, fd);
    // limpa o e-mail so quando o convite deu certo
    if (result?.success) formRef.current?.reset();
    return result;
  }, undefined);

  return (
    <form ref={formRef} onSubmit={submitWith(action)} className="invite-form">
      <Message state={state} />
      <input type="hidden" name="motelId" value={motelId} />
      <div className="invite-row">
        <input
          name="email"
          type="email"
          placeholder="email@exemplo.com"
          aria-label="E-mail da pessoa"
          required
          maxLength={200}
          className="text-input"
        />
        <select name="role" defaultValue="recepcao" aria-label="Perfil" className="select">
          {roleOptions.map((o) => (
            <option key={o.value} value={o.value}>
              {o.label}
            </option>
          ))}
        </select>
        <button type="submit" className="btn-primary compact" disabled={pending}>
          {pending ? "Enviando..." : "Convidar"}
        </button>
      </div>
    </form>
  );
}

// ---------- Linha de cada pessoa ----------
export function MemberRow({
  motelId,
  member,
  roleOptions,
  roleLabel,
}: {
  motelId: string;
  member: { userId: string; email: string; role: string; active: boolean; isMe: boolean };
  roleOptions: RoleOption[];
  roleLabel: string;
}) {
  const [roleState, roleAction, rolePending] = useActionState(changeRole, undefined);
  const [activeState, activeAction, activePending] = useActionState(setActive, undefined);

  return (
    <li className={member.active ? "member" : "member inactive"}>
      <div className="member-info">
        <span className="member-email">{member.email}</span>
        <span className="member-tags">
          {member.isMe && <span className="badge">Você</span>}
          {!member.active && <span className="badge muted">Desativado</span>}
        </span>
      </div>

      {member.isMe ? (
        <span className="badge">{roleLabel}</span>
      ) : (
        <div className="member-actions">
          <form onSubmit={submitWith(roleAction)} className="inline-form">
            <input type="hidden" name="motelId" value={motelId} />
            <input type="hidden" name="userId" value={member.userId} />
            <select
              name="role"
              defaultValue={member.role}
              aria-label={`Perfil de ${member.email}`}
              className="select"
            >
              {roleOptions.map((o) => (
                <option key={o.value} value={o.value}>
                  {o.label}
                </option>
              ))}
            </select>
            <button type="submit" className="secondary" disabled={rolePending}>
              {rolePending ? "..." : "Salvar"}
            </button>
          </form>
          <form onSubmit={submitWith(activeAction)} className="inline-form">
            <input type="hidden" name="motelId" value={motelId} />
            <input type="hidden" name="userId" value={member.userId} />
            <input type="hidden" name="active" value={member.active ? "false" : "true"} />
            <button
              type="submit"
              className={member.active ? "secondary danger" : "secondary"}
              disabled={activePending}
            >
              {activePending ? "..." : member.active ? "Desativar" : "Reativar"}
            </button>
          </form>
        </div>
      )}

      <div className="member-msg">
        <Message state={roleState} />
        <Message state={activeState} />
      </div>
    </li>
  );
}
