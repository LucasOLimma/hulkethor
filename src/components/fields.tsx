"use client";

import { useState } from "react";
import { AlertIcon, CheckIcon, LockIcon, MailIcon } from "./auth-shell";

// Campo de e-mail com icone.
export function EmailField() {
  return (
    <div className="field">
      <label htmlFor="email" className="sr-only">E-mail</label>
      <div className="input-wrap">
        <span className="input-icon">
          <MailIcon />
        </span>
        <input
          id="email"
          name="email"
          type="email"
          autoComplete="email"
          placeholder="Seu e-mail"
          required
          maxLength={200}
        />
      </div>
    </div>
  );
}

// Campo de senha com botao de mostrar/esconder.
export function PasswordField({
  id,
  label,
  autoComplete,
  minLength,
  placeholder,
}: {
  id: string;
  label: string;
  autoComplete: "current-password" | "new-password";
  minLength?: number;
  placeholder?: string;
}) {
  const [visible, setVisible] = useState(false);
  return (
    <div className="field">
      <label htmlFor={id} className="sr-only">
        {label}
      </label>
      <div className="input-wrap">
        <span className="input-icon">
          <LockIcon />
        </span>
        <input
          id={id}
          name={id}
          type={visible ? "text" : "password"}
          autoComplete={autoComplete}
          placeholder={placeholder ?? label}
          required
          minLength={minLength}
          maxLength={200}
        />
        <button
          type="button"
          className="toggle-visibility"
          onClick={() => setVisible((v) => !v)}
          aria-label={visible ? "Esconder senha" : "Mostrar senha"}
          aria-pressed={visible}
        >
          {visible ? <EyeOffIcon /> : <EyeIcon />}
        </button>
      </div>
    </div>
  );
}

export function SubmitButton({ pending, children, pendingText }: {
  pending: boolean;
  children: React.ReactNode;
  pendingText: string;
}) {
  return (
    <button type="submit" className="btn-primary" disabled={pending}>
      {pending && <span className="spinner" aria-hidden="true" />}
      {pending ? pendingText : children}
    </button>
  );
}

export function Alert({ kind, children }: { kind: "error" | "ok"; children: React.ReactNode }) {
  return (
    <p className={`alert ${kind}`} role={kind === "error" ? "alert" : "status"}>
      {kind === "error" ? <AlertIcon /> : <CheckIcon />}
      <span>{children}</span>
    </p>
  );
}

function EyeIcon() {
  return (
    <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
      <path d="M2 12s3.5-7 10-7 10 7 10 7-3.5 7-10 7S2 12 2 12Z" />
      <circle cx="12" cy="12" r="3" />
    </svg>
  );
}

function EyeOffIcon() {
  return (
    <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
      <path d="M10.6 5.1A10.6 10.6 0 0 1 12 5c6.5 0 10 7 10 7a17.6 17.6 0 0 1-2.6 3.6M6.6 6.6C3.7 8.4 2 12 2 12s3.5 7 10 7a9.7 9.7 0 0 0 5.4-1.6" />
      <path d="M9.9 9.9a3 3 0 0 0 4.2 4.2M3 3l18 18" />
    </svg>
  );
}
