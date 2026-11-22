// MARCA DA PLATAFORMA — troque aqui e muda em todas as telas.
// O nome aparece em duas cores: `first` em branco e `second` em dourado.
export const BRAND = {
  first: "Velvet",
  second: "Rouge",
  tagline: "Motel & Suítes",
  get name() {
    return `${this.first}${this.second}`;
  },
};
