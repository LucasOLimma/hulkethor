// Limpeza das suites (supabase/05_operacao.sql).
export type TaskStatus = "aguardando" | "em_limpeza" | "problema" | "concluida" | "cancelada";
export const TASK_LABEL: Record<TaskStatus, string> = {
  aguardando: "Aguardando limpeza",
  em_limpeza: "Em limpeza",
  problema: "Com problema",
  concluida: "Liberada",
  cancelada: "Cancelada",
};
export type Condition = "ok" | "observacoes" | "problema";
export const CONDITION_LABEL: Record<Condition, string> = {
  ok: "Tudo OK",
  observacoes: "Com observações",
  problema: "Problema",
};
export const OPEN_TASK_STATUSES: TaskStatus[] = ["aguardando", "em_limpeza", "problema"];
