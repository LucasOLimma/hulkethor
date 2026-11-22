import { redirect } from "next/navigation";

// A pagina inicial so encaminha: o proxy.ts decide entre /login e /painel.
export default function Home() {
  redirect("/painel");
}
