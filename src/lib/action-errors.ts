import { isMissingTable } from "./stock";

// Mensagem segura para erros do banco nas acoes do painel: so repassa as
// mensagens escritas por nos nas funcoes do banco (hint "estoque").
export const MSG_SEM_PERMISSAO = "Você não tem permissão para esta ação.";
export const MSG_ERRO = "Não foi possível concluir agora. Tente novamente.";

export function friendlyDbError(
  e: { code?: string; message?: string; hint?: string } | null,
  missingMsg = "Este módulo ainda não foi ativado no banco.",
): string {
  if (!e) return MSG_ERRO;
  if (e.hint === "estoque" && e.message) return e.message;
  if (isMissingTable(e)) return missingMsg;
  if (e.message?.includes("Sem permissao") || e.code === "42501") return MSG_SEM_PERMISSAO;
  return MSG_ERRO;
}
