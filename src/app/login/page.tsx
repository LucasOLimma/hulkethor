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
    <AuthShell title="Bem-vindo" subtitle="Entre com seu e-mail e senha para acessar o painel.">
      {erro === "link" && <Alert kind="error">O link é inválido ou expirou. Peça um novo.</Alert>}
      <LoginForm />
      <p className="auth-note">
        Acesso exclusivo por convite. Fale com o responsável pelo seu motel.
      </p>
    </AuthShell>
  );
}
