import Link from "next/link";
import { LoginForm } from "./login-form";

export default async function LoginPage({
  searchParams,
}: {
  searchParams: Promise<{ erro?: string }>;
}) {
  const { erro } = await searchParams;
  return (
    <main className="page">
      <div className="card">
        <h1>Entrar</h1>
        <p className="subtitle">Acesso da equipe do motel</p>
        {erro === "link" && (
          <p className="alert error" role="alert">
            O link é inválido ou expirou. Peça um novo.
          </p>
        )}
        <LoginForm />
        <p className="links">
          <Link href="/esqueci-senha">Esqueci minha senha</Link>
        </p>
      </div>
    </main>
  );
}
