"use client";

import { useActionState } from "react";
import { updatePassword } from "@/app/auth-actions";
import { AuthShell } from "@/components/auth-shell";
import { Alert, PasswordField, SubmitButton } from "@/components/fields";

// So chega aqui quem esta logado (o proxy.ts garante) — normalmente
// pelo link de recuperacao do e-mail, que abre uma sessao temporaria.
export default function ResetPasswordPage() {
  const [state, action, pending] = useActionState(updatePassword, undefined);

  return (
    <AuthShell title="Criar nova senha" subtitle="Use pelo menos 8 caracteres.">
      <form action={action} className="auth-form">
        {state?.error && <Alert kind="error">{state.error}</Alert>}
        <PasswordField id="password" label="Nova senha" placeholder="Nova senha" autoComplete="new-password" minLength={8} />
        <PasswordField
          id="confirm"
          label="Repita a nova senha"
          autoComplete="new-password"
          minLength={8}
        />
        <SubmitButton pending={pending} pendingText="Salvando...">
          Salvar nova senha
        </SubmitButton>
      </form>
    </AuthShell>
  );
}
