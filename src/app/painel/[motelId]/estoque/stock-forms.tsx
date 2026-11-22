"use client";

import { startTransition, useActionState, useRef, useState } from "react";
import { centsToInput } from "@/lib/periods";
import {
  KIND_LABEL,
  LOCATION_LABEL,
  LOCATIONS,
  UNIT_LABEL,
  UNITS,
  formatQty,
  type Location,
  type ProductKind,
  type Unit,
} from "@/lib/stock";
import {
  cancelInventory,
  closeInventory,
  deleteCategory,
  openInventory,
  registerEntry,
  registerExit,
  registerTransfer,
  reverseMovement,
  saveCategory,
  saveCounts,
  saveProduct,
  saveSupplier,
  setProductActive,
  setSupplierActive,
  type StockState,
} from "./actions";

export type ProductOption = {
  id: string;
  name: string;
  unit: Unit;
  kind: ProductKind;
  tracksExpiry: boolean;
  active: boolean;
};
export type Product = ProductOption & {
  categoryId: string;
  minQty: number;
  salePriceCents: number | null;
  sku: string | null;
};
export type Category = { id: string; name: string; productCount: number };
export type Supplier = {
  id: string;
  name: string;
  document: string | null;
  phone: string | null;
  email: string | null;
  notes: string | null;
  active: boolean;
};

type Action = (prev: StockState, fd: FormData) => Promise<StockState>;

function Msg({ state }: { state: StockState }) {
  if (state?.error) return <p className="alert error" role="alert">{state.error}</p>;
  if (state?.success) return <p className="alert ok" role="status">{state.success}</p>;
  return null;
}

function newKey(): string {
  if (typeof crypto.randomUUID === "function") return crypto.randomUUID();
  // navegadores sem randomUUID (ex.: endereco http da rede local)
  const b = crypto.getRandomValues(new Uint8Array(16));
  b[6] = (b[6] & 0x0f) | 0x40;
  b[8] = (b[8] & 0x3f) | 0x80;
  const h = Array.from(b, (x) => x.toString(16).padStart(2, "0")).join("");
  return `${h.slice(0, 8)}-${h.slice(8, 12)}-${h.slice(12, 16)}-${h.slice(16, 20)}-${h.slice(20)}`;
}

/**
 * Formulario que nao e limpo pelo React em caso de erro, e que envia uma
 * chave anti-duplicidade: a mesma tentativa (clique duplo, rede lenta) usa a
 * mesma chave e o banco lanca uma vez so. Depois de um sucesso, nova chave.
 */
function useStockForm(action: Action, opts: { reset?: boolean; confirm?: string; onSuccess?: () => void } = {}) {
  const formRef = useRef<HTMLFormElement>(null);
  const keyRef = useRef<string | null>(null);
  const [state, run, pending] = useActionState(async (prev: StockState, fd: FormData) => {
    const result = await action(prev, fd);
    if (result?.success) {
      keyRef.current = null;
      if (opts.reset) formRef.current?.reset();
      opts.onSuccess?.();
    }
    return result;
  }, undefined);

  const onSubmit = (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (opts.confirm && !window.confirm(opts.confirm)) return;
    if (!keyRef.current) keyRef.current = newKey();
    const fd = new FormData(event.currentTarget);
    fd.set("key", keyRef.current);
    startTransition(() => run(fd));
  };
  return { state, onSubmit, pending, formRef };
}

function Hidden({ motelId, extra }: { motelId: string; extra?: Record<string, string> }) {
  return (
    <>
      <input type="hidden" name="motelId" value={motelId} />
      {extra && Object.entries(extra).map(([k, v]) => <input key={k} type="hidden" name={k} value={v} />)}
    </>
  );
}

function ProductSelect({
  products,
  value,
  onChange,
  label = "Produto",
}: {
  products: ProductOption[];
  value: string;
  onChange: (id: string) => void;
  label?: string;
}) {
  return (
    <label className="field">
      <span>{label}</span>
      <select name="productId" className="select" value={value} onChange={(e) => onChange(e.target.value)} required>
        <option value="">Escolha…</option>
        {products.map((p) => (
          <option key={p.id} value={p.id}>
            {p.name} ({p.unit})
          </option>
        ))}
      </select>
    </label>
  );
}

// =====================================================================
// MOVIMENTAR
// =====================================================================

export function EntryForm({ motelId, products, suppliers }: { motelId: string; products: ProductOption[]; suppliers: Supplier[] }) {
  const [productId, setProductId] = useState("");
  const { state, onSubmit, pending, formRef } = useStockForm(registerEntry, {
    reset: true,
    onSuccess: () => setProductId(""),
  });
  const product = products.find((p) => p.id === productId);

  return (
    <form ref={formRef} onSubmit={onSubmit} className="res-form stock-form">
      <h3>Entrada de mercadoria</h3>
      <Msg state={state} />
      <Hidden motelId={motelId} />
      <div className="form-grid stock-grid">
        <ProductSelect products={products} value={productId} onChange={setProductId} />
        <label className="field">
          <span>Quantidade{product ? ` (${product.unit})` : ""}</span>
          <input name="qty" className="text-input" inputMode="decimal" placeholder="Ex.: 24" required maxLength={15} />
        </label>
        <label className="field">
          <span>Custo unitário</span>
          <div className="money">
            <span>R$</span>
            <input name="unitCost" className="text-input" inputMode="decimal" placeholder="0,00" required maxLength={15} />
          </div>
        </label>
        <label className="field">
          <span>Fornecedor (opcional)</span>
          <select name="supplierId" className="select" defaultValue="">
            <option value="">—</option>
            {suppliers.filter((s) => s.active).map((s) => (
              <option key={s.id} value={s.id}>{s.name}</option>
            ))}
          </select>
        </label>
        <label className="field">
          <span>Nota fiscal (opcional)</span>
          <input name="invoice" className="text-input" maxLength={60} />
        </label>
        {product?.kind !== "enxoval" && (
          <>
            <label className="field">
              <span>Lote (opcional)</span>
              <input name="lotCode" className="text-input" maxLength={40} />
            </label>
            <label className="field">
              <span>Validade{product?.tracksExpiry ? "" : " (opcional)"}</span>
              <input name="expiresOn" type="date" className="text-input" required={Boolean(product?.tracksExpiry)} />
            </label>
          </>
        )}
      </div>
      <label className="field">
        <span>Observação (opcional)</span>
        <input name="notes" className="text-input" maxLength={500} />
      </label>
      <div className="form-actions">
        <button type="submit" className="btn-primary compact" disabled={pending}>
          {pending ? "Registrando..." : "Registrar entrada"}
        </button>
      </div>
    </form>
  );
}

export function ExitForm({ motelId, products, isOwner }: { motelId: string; products: ProductOption[]; isOwner: boolean }) {
  const [productId, setProductId] = useState("");
  const [type, setType] = useState("consumo");
  const { state, onSubmit, pending, formRef } = useStockForm(registerExit, {
    reset: true,
    onSuccess: () => {
      setProductId("");
      setType("consumo");
    },
  });
  const product = products.find((p) => p.id === productId);
  const isEnxoval = product?.kind === "enxoval";
  const types = isEnxoval
    ? (isOwner ? ["perda", "avaria"] : [])
    : ["consumo", "uso_interno", ...(isOwner ? ["perda", "avaria", "vencimento"] : [])];
  const labels: Record<string, string> = {
    consumo: "Consumo (frigobar, amenities)",
    uso_interno: "Uso interno (limpeza, manutenção)",
    perda: "Perda",
    avaria: "Avaria",
    vencimento: "Vencimento",
  };
  const needsReason = ["perda", "avaria", "vencimento"].includes(type);
  const effectiveType = types.includes(type) ? type : types[0] ?? "";

  return (
    <form ref={formRef} onSubmit={onSubmit} className="res-form stock-form">
      <h3>Saída</h3>
      <Msg state={state} />
      <Hidden motelId={motelId} />
      <div className="form-grid stock-grid">
        <ProductSelect products={products} value={productId} onChange={setProductId} />
        <label className="field">
          <span>Tipo de saída</span>
          <select name="type" className="select" value={effectiveType} onChange={(e) => setType(e.target.value)} required>
            {types.map((t) => (
              <option key={t} value={t}>{labels[t]}</option>
            ))}
          </select>
        </label>
        {isEnxoval && (
          <label className="field">
            <span>De onde</span>
            <select name="location" className="select" defaultValue="estoque">
              {LOCATIONS.map((l) => (
                <option key={l} value={l}>{LOCATION_LABEL[l]}</option>
              ))}
            </select>
          </label>
        )}
        <label className="field">
          <span>Quantidade{product ? ` (${product.unit})` : ""}</span>
          <input name="qty" className="text-input" inputMode="decimal" placeholder="Ex.: 2" required maxLength={15} />
        </label>
      </div>
      {isEnxoval && types.length === 0 ? (
        <p className="res-hint">Enxoval circula (use “Enxoval” ao lado). Perda e avaria de enxoval são registradas pelo proprietário.</p>
      ) : (
        <label className="field">
          <span>Motivo{needsReason ? "" : " (opcional)"}</span>
          <input name="reason" className="text-input" maxLength={500} required={needsReason} placeholder={needsReason ? "Ex.: garrafa quebrou no transporte" : ""} />
        </label>
      )}
      <div className="form-actions">
        <button type="submit" className="btn-primary compact" disabled={pending || types.length === 0}>
          {pending ? "Registrando..." : "Registrar saída"}
        </button>
      </div>
    </form>
  );
}

const FLOWS: { from: Location; to: Location; label: string }[] = [
  { from: "estoque", to: "em_uso", label: "Estoque → Suítes (repor)" },
  { from: "em_uso", to: "lavanderia", label: "Suítes → Lavanderia" },
  { from: "lavanderia", to: "estoque", label: "Lavanderia → Estoque (voltou limpo)" },
  { from: "em_uso", to: "estoque", label: "Suítes → Estoque" },
  { from: "estoque", to: "lavanderia", label: "Estoque → Lavanderia" },
];

export function TransferForm({ motelId, products }: { motelId: string; products: ProductOption[] }) {
  const [productId, setProductId] = useState("");
  const [flow, setFlow] = useState(0);
  const { state, onSubmit, pending, formRef } = useStockForm(registerTransfer, { reset: true, onSuccess: () => setProductId("") });
  const product = products.find((p) => p.id === productId);
  const f = FLOWS[flow];

  return (
    <form ref={formRef} onSubmit={onSubmit} className="res-form stock-form">
      <h3>Enxoval (circulação)</h3>
      <Msg state={state} />
      <Hidden motelId={motelId} extra={{ from: f.from, to: f.to }} />
      {products.length === 0 ? (
        <p className="res-hint">Nenhum item de enxoval cadastrado.</p>
      ) : (
        <>
          <div className="form-grid stock-grid">
            <ProductSelect products={products} value={productId} onChange={setProductId} label="Item" />
            <label className="field">
              <span>Movimento</span>
              <select className="select" value={flow} onChange={(e) => setFlow(Number(e.target.value))}>
                {FLOWS.map((x, i) => (
                  <option key={x.label} value={i}>{x.label}</option>
                ))}
              </select>
            </label>
            <label className="field">
              <span>Quantidade{product ? ` (${product.unit})` : ""}</span>
              <input name="qty" className="text-input" inputMode="decimal" placeholder="Ex.: 10" required maxLength={15} />
            </label>
          </div>
          <label className="field">
            <span>Observação (opcional)</span>
            <input name="notes" className="text-input" maxLength={500} />
          </label>
          <div className="form-actions">
            <button type="submit" className="btn-primary compact" disabled={pending}>
              {pending ? "Registrando..." : "Registrar movimento"}
            </button>
          </div>
        </>
      )}
    </form>
  );
}

export function ReverseButton({ motelId, movementId }: { motelId: string; movementId: string }) {
  const [open, setOpen] = useState(false);
  const { state, onSubmit, pending } = useStockForm(reverseMovement);
  if (state?.success) return <span className="stock-reversed">Estornado</span>;
  if (!open)
    return (
      <button type="button" className="btn-link small" onClick={() => setOpen(true)}>
        Estornar
      </button>
    );
  return (
    <form onSubmit={onSubmit} className="stock-reverse">
      <Hidden motelId={motelId} extra={{ movementId }} />
      <input name="reason" className="text-input" placeholder="Motivo do estorno" required minLength={3} maxLength={500} aria-label="Motivo do estorno" />
      <button type="submit" className="btn-ghost" disabled={pending}>{pending ? "..." : "Confirmar"}</button>
      <button type="button" className="btn-link small" onClick={() => setOpen(false)}>Cancelar</button>
      {state?.error && <p className="alert error" role="alert">{state.error}</p>}
    </form>
  );
}

// =====================================================================
// CONFERENCIA
// =====================================================================

export function OpenInventoryForm({ motelId, busy }: { motelId: string; busy: Location[] }) {
  const { state, onSubmit, pending } = useStockForm(openInventory);
  const free = LOCATIONS.filter((l) => !busy.includes(l));
  if (free.length === 0) return null;
  return (
    <form onSubmit={onSubmit} className="res-form stock-form inline">
      <Msg state={state} />
      <Hidden motelId={motelId} />
      <div className="stock-inline">
        <label className="field">
          <span>Nova conferência em</span>
          <select name="location" className="select" defaultValue={free[0]}>
            {free.map((l) => (
              <option key={l} value={l}>{LOCATION_LABEL[l]}</option>
            ))}
          </select>
        </label>
        <button type="submit" className="btn-primary compact" disabled={pending}>
          {pending ? "Abrindo..." : "Abrir conferência"}
        </button>
      </div>
    </form>
  );
}

export type CountRow = { productId: string; name: string; unit: string; counted: number | null; system: number | null };

export function CountForm({
  motelId,
  inventoryId,
  rows,
  showSystem,
}: {
  motelId: string;
  inventoryId: string;
  rows: CountRow[];
  showSystem: boolean;
}) {
  const { state, onSubmit, pending } = useStockForm(saveCounts);
  return (
    <form onSubmit={onSubmit} className="stock-count">
      <Msg state={state} />
      <Hidden motelId={motelId} extra={{ inventoryId }} />
      <div className="table-wrap">
        <table className="data-table">
          <thead>
            <tr>
              <th>Item</th>
              {showSystem && <th className="num">No sistema</th>}
              <th className="num">Contado</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => (
              <tr key={r.productId}>
                <td>{r.name}</td>
                {showSystem && <td className="num">{r.system === null ? "—" : formatQty(r.system, r.unit)}</td>}
                <td className="num">
                  <input
                    name={`count_${r.productId}`}
                    className="text-input count-input"
                    inputMode="decimal"
                    defaultValue={r.counted === null ? "" : String(r.counted).replace(".", ",")}
                    placeholder={r.unit}
                    maxLength={15}
                    aria-label={`Quantidade contada de ${r.name}`}
                  />
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <div className="form-actions">
        <button type="submit" className="btn-primary compact" disabled={pending}>
          {pending ? "Salvando..." : "Salvar contagem"}
        </button>
      </div>
    </form>
  );
}

export function InventoryOwnerActions({ motelId, inventoryId }: { motelId: string; inventoryId: string }) {
  const close = useStockForm(closeInventory, {
    confirm: "Fechar a conferência? Os saldos dos itens contados passam a ser os valores contados (com ajuste no histórico).",
  });
  const cancel = useStockForm(cancelInventory, { confirm: "Cancelar a conferência? Nada será ajustado." });
  return (
    <div className="stock-owner-actions">
      <Msg state={close.state ?? cancel.state} />
      <form onSubmit={close.onSubmit}>
        <Hidden motelId={motelId} extra={{ inventoryId }} />
        <button type="submit" className="btn-gold" disabled={close.pending}>
          {close.pending ? "Fechando..." : "Fechar e ajustar saldos"}
        </button>
      </form>
      <form onSubmit={cancel.onSubmit}>
        <Hidden motelId={motelId} extra={{ inventoryId }} />
        <button type="submit" className="btn-ghost" disabled={cancel.pending}>
          Cancelar conferência
        </button>
      </form>
    </div>
  );
}

// =====================================================================
// CADASTROS (so o dono)
// =====================================================================

export function ProductForm({
  motelId,
  categories,
  product,
  onDone,
}: {
  motelId: string;
  categories: Category[];
  product?: Product;
  onDone?: () => void;
}) {
  const [kind, setKind] = useState<ProductKind>(product?.kind ?? "consumo");
  const { state, onSubmit, pending, formRef } = useStockForm(saveProduct, {
    reset: !product,
    onSuccess: () => {
      if (product) onDone?.();
      else setKind("consumo");
    },
  });
  return (
    <form ref={formRef} onSubmit={onSubmit} className="res-form stock-form">
      <Msg state={state} />
      <Hidden motelId={motelId} extra={{ id: product?.id ?? "" }} />
      <div className="form-grid stock-grid">
        <label className="field">
          <span>Nome</span>
          <input name="name" className="text-input" defaultValue={product?.name} required maxLength={120} placeholder="Ex.: Água mineral 500 ml" />
        </label>
        <label className="field">
          <span>Categoria</span>
          <select name="categoryId" className="select" defaultValue={product?.categoryId ?? ""} required>
            <option value="">Escolha…</option>
            {categories.map((c) => (
              <option key={c.id} value={c.id}>{c.name}</option>
            ))}
          </select>
        </label>
        <label className="field">
          <span>Tipo</span>
          <select name="kind" className="select" value={kind} onChange={(e) => setKind(e.target.value as ProductKind)}>
            <option value="consumo">{KIND_LABEL.consumo}</option>
            <option value="enxoval">{KIND_LABEL.enxoval}</option>
          </select>
        </label>
        <label className="field">
          <span>Unidade</span>
          <select name="unit" className="select" defaultValue={product?.unit ?? "un"}>
            {UNITS.map((u) => (
              <option key={u} value={u}>{UNIT_LABEL[u]}</option>
            ))}
          </select>
        </label>
        <label className="field">
          <span>Estoque mínimo</span>
          <input name="minQty" className="text-input" inputMode="decimal" defaultValue={product ? String(product.minQty).replace(".", ",") : ""} placeholder="0" maxLength={15} />
        </label>
        <label className="field">
          <span>Preço de venda (frigobar, opcional)</span>
          <div className="money">
            <span>R$</span>
            <input name="salePrice" className="text-input" inputMode="decimal" defaultValue={product?.salePriceCents == null ? "" : centsToInput(product.salePriceCents)} placeholder="0,00" maxLength={15} />
          </div>
        </label>
        <label className="field">
          <span>Código interno (opcional)</span>
          <input name="sku" className="text-input" defaultValue={product?.sku ?? ""} maxLength={40} />
        </label>
      </div>
      {kind === "consumo" ? (
        <label className="check-row">
          <input type="checkbox" name="tracksExpiry" defaultChecked={product?.tracksExpiry} />
          Controlar validade (pede a data de validade em cada entrada e avisa antes de vencer)
        </label>
      ) : (
        <p className="res-hint">Enxoval circula entre estoque, suítes e lavanderia, e só sai de vez por perda ou avaria.</p>
      )}
      <div className="form-actions">
        {product && onDone && (
          <button type="button" className="secondary" onClick={onDone}>Cancelar</button>
        )}
        <button type="submit" className="btn-primary compact" disabled={pending}>
          {pending ? "Salvando..." : product ? "Salvar alterações" : "Cadastrar produto"}
        </button>
      </div>
    </form>
  );
}

export function ProductRow({ motelId, product, categories, categoryName }: { motelId: string; product: Product; categories: Category[]; categoryName: string }) {
  const [editing, setEditing] = useState(false);
  const toggle = useStockForm(setProductActive, {
    confirm: product.active ? `Desativar "${product.name}"? Ele some das listas de movimentação, mas o histórico fica.` : undefined,
  });
  if (editing)
    return (
      <li className="stock-row editing">
        <ProductForm motelId={motelId} categories={categories} product={product} onDone={() => setEditing(false)} />
      </li>
    );
  return (
    <li className={`stock-row ${product.active ? "" : "inactive"}`}>
      <div className="stock-row-main">
        <strong>{product.name}</strong>
        <span className="res-meta">
          {categoryName} · {KIND_LABEL[product.kind]} · {UNIT_LABEL[product.unit]}
          {product.minQty > 0 ? ` · mínimo ${formatQty(product.minQty, product.unit)}` : ""}
          {product.tracksExpiry ? " · controla validade" : ""}
          {!product.active ? " · desativado" : ""}
        </span>
      </div>
      <div className="stock-row-actions">
        <button type="button" className="btn-link small" onClick={() => setEditing(true)}>Editar</button>
        <form onSubmit={toggle.onSubmit}>
          <Hidden motelId={motelId} extra={{ id: product.id, active: String(!product.active) }} />
          <button type="submit" className="btn-link small" disabled={toggle.pending}>
            {product.active ? "Desativar" : "Reativar"}
          </button>
        </form>
      </div>
      {toggle.state?.error && <p className="alert error" role="alert">{toggle.state.error}</p>}
    </li>
  );
}

export function NewProduct({ motelId, categories }: { motelId: string; categories: Category[] }) {
  const [open, setOpen] = useState(false);
  if (!open)
    return (
      <button type="button" className="btn-gold" onClick={() => setOpen(true)}>
        + Novo produto
      </button>
    );
  return (
    <div className="panel-box stock-new">
      <ProductForm motelId={motelId} categories={categories} />
      <button type="button" className="btn-link small" onClick={() => setOpen(false)}>Fechar</button>
    </div>
  );
}

export function CategoryManager({ motelId, categories }: { motelId: string; categories: Category[] }) {
  const { state, onSubmit, pending, formRef } = useStockForm(saveCategory, { reset: true });
  return (
    <div className="stock-categories">
      <ul className="chip-list">
        {categories.map((c) => (
          <CategoryChip key={c.id} motelId={motelId} category={c} />
        ))}
      </ul>
      <form ref={formRef} onSubmit={onSubmit} className="stock-inline">
        <Hidden motelId={motelId} extra={{ id: "" }} />
        <input name="name" className="text-input" placeholder="Nova categoria" required minLength={2} maxLength={60} aria-label="Nome da nova categoria" />
        <button type="submit" className="btn-ghost" disabled={pending}>Adicionar</button>
      </form>
      <Msg state={state} />
    </div>
  );
}

function CategoryChip({ motelId, category }: { motelId: string; category: Category }) {
  const [editing, setEditing] = useState(false);
  const rename = useStockForm(saveCategory, { onSuccess: () => setEditing(false) });
  const remove = useStockForm(deleteCategory, { confirm: `Excluir a categoria "${category.name}"?` });
  const err = rename.state?.error ?? remove.state?.error;
  return (
    <li className="chip">
      {editing ? (
        <form onSubmit={rename.onSubmit} className="stock-inline">
          <Hidden motelId={motelId} extra={{ id: category.id }} />
          <input name="name" className="text-input" defaultValue={category.name} required minLength={2} maxLength={60} aria-label="Novo nome" />
          <button type="submit" className="btn-link small" disabled={rename.pending}>Salvar</button>
          <button type="button" className="btn-link small" onClick={() => setEditing(false)}>Cancelar</button>
        </form>
      ) : (
        <>
          <span>{category.name}</span>
          <small>{category.productCount}</small>
          <button type="button" className="chip-btn" onClick={() => setEditing(true)} aria-label={`Renomear ${category.name}`}>✎</button>
          {category.productCount === 0 && (
            <form onSubmit={remove.onSubmit}>
              <Hidden motelId={motelId} extra={{ id: category.id }} />
              <button type="submit" className="chip-btn" aria-label={`Excluir ${category.name}`}>×</button>
            </form>
          )}
        </>
      )}
      {err && <span className="chip-error" role="alert">{err}</span>}
    </li>
  );
}

function SupplierForm({ motelId, supplier, onDone }: { motelId: string; supplier?: Supplier; onDone?: () => void }) {
  const { state, onSubmit, pending, formRef } = useStockForm(saveSupplier, {
    reset: !supplier,
    onSuccess: () => supplier && onDone?.(),
  });
  return (
    <form ref={formRef} onSubmit={onSubmit} className="res-form stock-form">
      <Msg state={state} />
      <Hidden motelId={motelId} extra={{ id: supplier?.id ?? "" }} />
      <div className="form-grid stock-grid">
        <label className="field">
          <span>Nome</span>
          <input name="name" className="text-input" defaultValue={supplier?.name} required maxLength={120} />
        </label>
        <label className="field">
          <span>CNPJ/CPF (opcional)</span>
          <input name="document" className="text-input" defaultValue={supplier?.document ?? ""} maxLength={30} />
        </label>
        <label className="field">
          <span>Telefone (opcional)</span>
          <input name="phone" className="text-input" defaultValue={supplier?.phone ?? ""} maxLength={30} />
        </label>
        <label className="field">
          <span>E-mail (opcional)</span>
          <input name="email" type="email" className="text-input" defaultValue={supplier?.email ?? ""} maxLength={120} />
        </label>
      </div>
      <label className="field">
        <span>Observações (opcional)</span>
        <input name="notes" className="text-input" defaultValue={supplier?.notes ?? ""} maxLength={500} />
      </label>
      <div className="form-actions">
        {supplier && onDone && <button type="button" className="secondary" onClick={onDone}>Cancelar</button>}
        <button type="submit" className="btn-primary compact" disabled={pending}>
          {pending ? "Salvando..." : supplier ? "Salvar" : "Cadastrar fornecedor"}
        </button>
      </div>
    </form>
  );
}

export function NewSupplier({ motelId }: { motelId: string }) {
  const [open, setOpen] = useState(false);
  if (!open)
    return (
      <button type="button" className="btn-ghost" onClick={() => setOpen(true)}>
        + Novo fornecedor
      </button>
    );
  return (
    <div className="panel-box stock-new">
      <SupplierForm motelId={motelId} />
      <button type="button" className="btn-link small" onClick={() => setOpen(false)}>Fechar</button>
    </div>
  );
}

export function SupplierRow({ motelId, supplier }: { motelId: string; supplier: Supplier }) {
  const [editing, setEditing] = useState(false);
  const toggle = useStockForm(setSupplierActive);
  if (editing)
    return (
      <li className="stock-row editing">
        <SupplierForm motelId={motelId} supplier={supplier} onDone={() => setEditing(false)} />
      </li>
    );
  return (
    <li className={`stock-row ${supplier.active ? "" : "inactive"}`}>
      <div className="stock-row-main">
        <strong>{supplier.name}</strong>
        <span className="res-meta">
          {[supplier.document, supplier.phone, supplier.email].filter(Boolean).join(" · ") || "Sem contato cadastrado"}
          {!supplier.active ? " · desativado" : ""}
        </span>
      </div>
      <div className="stock-row-actions">
        <button type="button" className="btn-link small" onClick={() => setEditing(true)}>Editar</button>
        <form onSubmit={toggle.onSubmit}>
          <Hidden motelId={motelId} extra={{ id: supplier.id, active: String(!supplier.active) }} />
          <button type="submit" className="btn-link small" disabled={toggle.pending}>
            {supplier.active ? "Desativar" : "Reativar"}
          </button>
        </form>
      </div>
      {toggle.state?.error && <p className="alert error" role="alert">{toggle.state.error}</p>}
    </li>
  );
}
