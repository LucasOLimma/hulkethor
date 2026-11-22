// Sigla do estabelecimento para avatares (ignora a palavra "Motel", que
// se repete em quase todos os nomes e deixaria siglas iguais).
export function motelInitials(name: string) {
  const words = name.split(/\s+/).filter(Boolean);
  const useful = words.filter((w) => !/^motel$/i.test(w));
  const list = useful.length ? useful : words;
  return list
    .slice(0, 2)
    .map((w) => w[0]!.toUpperCase())
    .join("");
}
