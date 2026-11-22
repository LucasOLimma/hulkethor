import { redirect } from "next/navigation";

// Endereço antigo: agora a tela fica dentro do painel do motel.
export default async function OldRoute({ params }: { params: Promise<{ motelId: string }> }) {
  const { motelId } = await params;
  redirect(`/painel/${encodeURIComponent(motelId)}/equipe`);
}
