"use client";

import Link from "next/link";
import { startTransition, useActionState } from "react";
import { signIn } from "@/app/auth-actions";
import { Alert, EmailField, PasswordField, SubmitButton } from "@/components/fields";

export function LoginForm() {
  const [state, action, pending] = useActionState(signIn, undefined);

  // Envia sem deixar o React limpar o formulario depois:
  // assim o e-mail digitado continua no campo quando a senha esta errada.
  function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const formData = new FormData(event.currentTarget);
    startTransition(() => action(formData));
  }

  return (
    <form onSubmit={handleSubmit} className="auth-form">
      {state?.error && <Alert kind="error">{state.error}</Alert>}
      <EmailField />
      <PasswordField
        id="password"
        label="Senha"
        autoComplete="current-password"
        aside={
          <Link href="/esqueci-senha" className="small-link">
            Esqueci minha senha
          </Link>
        }
      />
      <SubmitButton pending={pending} pendingText="Entrando...">
        Entrar
      </SubmitButton>
    </form>
  );
}
