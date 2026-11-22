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
    <AuthShell
      title={
        <>
          Faça seu login e viva uma <em>noite inesquecível</em>
        </>
      }
    >
      {erro === "link" && <Alert kind="error">O link é inválido ou expirou. Peça um novo.</Alert>}
      <LoginForm />
      <p className="auth-note">
        Acesso exclusivo para a equipe do motel, por convite.
      </p>
    </AuthShell>
  );
}
