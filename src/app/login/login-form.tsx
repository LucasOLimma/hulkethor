"use client";

import { useActionState } from "react";
import { signIn } from "@/app/auth-actions";

export function LoginForm() {
  const [state, action, pending] = useActionState(signIn, undefined);

  return (
    <form action={action}>
      {state?.error && (
        <p className="alert error" role="alert">
          {state.error}
        </p>
      )}
      <label>
        E-mail
        <input name="email" type="email" autoComplete="email" required maxLength={200} />
      </label>
      <label>
        Senha
        <input
          name="password"
          type="password"
          autoComplete="current-password"
          required
          maxLength={200}
        />
      </label>
      <button type="submit" disabled={pending}>
        {pending ? "Entrando..." : "Entrar"}
      </button>
    </form>
  );
}
