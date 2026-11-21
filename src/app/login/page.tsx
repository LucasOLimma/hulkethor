import { AuthShell } from "@/components/auth-shell";
import { Alert } from "@/components/fields";
import { LoginForm } from "./login-form";

export default async function LoginPage({
  searchParams,
}: {
  searchParams: Promise<{ erro?: string }>;
}) {
  const { erro } = await searchParams;
  return (
    <AuthShell title="Bem-vindo de volta" subtitle="Entre com seu e-mail e senha para continuar.">
      {erro === "link" && <Alert kind="error">O link é inválido ou expirou. Peça um novo.</Alert>}
      <LoginForm />
    </AuthShell>
  );
}
