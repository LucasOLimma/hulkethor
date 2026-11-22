"use client";

import { useState } from "react";
import { Hidden, Msg, useKeyedForm } from "@/components/app/keyed-form";
import { formatQty } from "@/lib/stock";
import { deleteSuiteCategory, removeKitItem, saveSuiteCategory, setKitItem } from "./category-actions";

export type SuiteCategory = {
  id: string;
  name: string;
  suiteNumbers: string[];
  kit: { productId: string; name: string; unit: string; qty: number; kind: "consumo" | "enxoval" }[];
};
export type KitProduct = { id: string; name: string; unit: string; kind: "consumo" | "enxoval" };

export function SuiteCategories({ motelId, categories, products }: { motelId: string; categories: SuiteCategory[]; products: KitProduct[] }) {
  const { state: createState, onSubmit: createSubmit, pending: createPending, formRef: createRef } = useKeyedForm(saveSuiteCategory, { reset: true });
  return (
    <section className="panel-box cat-box">
      <div className="panel-box-head">
        <h2 className="section-title">Categorias e kit padrão</h2>
      </div>
      <p className="res-hint">
        O <strong>kit padrão</strong> é o que a camareira repõe a cada limpeza: o enxoval é trocado (estoque → suíte → lavanderia) e os
        amenities saem do estoque. Escolha a categoria de cada suíte em “Editar”.
      </p>
      <ul className="cat-list">
        {categories.map((c) => (
          <CategoryItem key={c.id} motelId={motelId} category={c} products={products} />
        ))}
      </ul>
      <form ref={createRef} onSubmit={createSubmit} className="stock-inline">
        <Hidden motelId={motelId} extra={{ id: "" }} />
        <input name="name" className="text-input" placeholder="Nova categoria (ex.: Luxo com hidro)" required minLength={2} maxLength={60} aria-label="Nome da nova categoria" />
        <button type="submit" className="btn-ghost" disabled={createPending}>Criar categoria</button>
      </form>
      <Msg state={createState} />
    </section>
  );
}

function CategoryItem({ motelId, category, products }: { motelId: string; category: SuiteCategory; products: KitProduct[] }) {
  const [renaming, setRenaming] = useState(false);
  const rename = useKeyedForm(saveSuiteCategory, { onSuccess: () => setRenaming(false) });
  const remove = useKeyedForm(deleteSuiteCategory, {
    confirm: `Excluir a categoria "${category.name}"? As suítes dela ficam sem categoria (e sem kit).`,
  });
  const { state: addState, onSubmit: addSubmit, pending: addPending, formRef: addRef } = useKeyedForm(setKitItem, { reset: true });
  const del = useKeyedForm(removeKitItem);
  const msg = rename.state ?? remove.state ?? addState ?? del.state;

  return (
    <li className="cat-item">
      <div className="cat-head">
        {renaming ? (
          <form onSubmit={rename.onSubmit} className="stock-inline">
            <Hidden motelId={motelId} extra={{ id: category.id }} />
            <input name="name" className="text-input" defaultValue={category.name} required minLength={2} maxLength={60} aria-label="Novo nome" />
            <button type="submit" className="btn-link small">Salvar</button>
            <button type="button" className="btn-link small" onClick={() => setRenaming(false)}>Cancelar</button>
          </form>
        ) : (
          <>
            <div>
              <strong>{category.name}</strong>
              <small className="stock-sub">
                {category.suiteNumbers.length ? `Suítes ${category.suiteNumbers.join(", ")}` : "Nenhuma suíte nesta categoria"}
              </small>
            </div>
            <div className="stock-row-actions">
              <button type="button" className="btn-link small" onClick={() => setRenaming(true)}>Renomear</button>
              <form onSubmit={remove.onSubmit}>
                <Hidden motelId={motelId} extra={{ id: category.id }} />
                <button type="submit" className="btn-link small">Excluir</button>
              </form>
            </div>
          </>
        )}
      </div>

      {category.kit.length === 0 ? (
        <p className="res-hint">Kit vazio.</p>
      ) : (
        <ul className="chip-list">
          {category.kit.map((k) => (
            <li key={k.productId} className="chip">
              <span>{formatQty(k.qty)} × {k.name}</span>
              <small>{k.kind === "enxoval" ? "troca" : "repõe"}</small>
              <form onSubmit={del.onSubmit}>
                <Hidden motelId={motelId} extra={{ categoryId: category.id, productId: k.productId }} />
                <button type="submit" className="chip-btn" aria-label={`Tirar ${k.name} do kit`}>×</button>
              </form>
            </li>
          ))}
        </ul>
      )}

      {products.length > 0 && (
        <form ref={addRef} onSubmit={addSubmit} className="stock-inline cat-add">
          <Hidden motelId={motelId} extra={{ categoryId: category.id }} />
          <select name="productId" className="select" required defaultValue="" aria-label="Produto do kit">
            <option value="">Adicionar ao kit…</option>
            {products.map((p) => (
              <option key={p.id} value={p.id}>{p.name} ({p.unit})</option>
            ))}
          </select>
          <input name="qty" className="text-input cat-qty" inputMode="decimal" placeholder="Qtd." required maxLength={10} aria-label="Quantidade" />
          <button type="submit" className="btn-ghost" disabled={addPending}>Adicionar</button>
        </form>
      )}
      <Msg state={msg} />
    </li>
  );
}
