// Celular brasileiro com DDD. Guardado so com numeros (10 ou 11 digitos),
// igual a funcao _phone_digits do banco (07_portal_cliente.sql).
export function normalizePhone(input: string): string | null {
  let d = input.replace(/\D/g, "");
  if (/^55\d{10,11}$/.test(d)) d = d.slice(2);
  return /^\d{10,11}$/.test(d) ? d : null;
}

// "11987654321" -> "(11) 98765-4321"
export function formatPhone(digits: string | null | undefined): string {
  if (!digits) return "";
  const d = digits.replace(/\D/g, "");
  if (d.length === 11) return `(${d.slice(0, 2)}) ${d.slice(2, 7)}-${d.slice(7)}`;
  if (d.length === 10) return `(${d.slice(0, 2)}) ${d.slice(2, 6)}-${d.slice(6)}`;
  return d;
}
