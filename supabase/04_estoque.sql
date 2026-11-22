-- =====================================================================
-- ETAPA 4 | Estoque (Fase 1A)
--
-- PRE-REQUISITO: 01, 02 e 03 ja executados.
--
-- O QUE FAZ (so ACRESCENTA tabelas e funcoes; nao altera nem apaga nada
-- das tabelas existentes):
--   * Cadastros: categorias, fornecedores e produtos.
--   * Saldo por local: estoque, em uso (nas suites) e lavanderia.
--     - Produto de CONSUMO (amenities, frigobar, limpeza): vive no estoque
--       e sai por consumo, uso interno, perda, avaria ou vencimento.
--     - ENXOVAL (toalhas, lencois): CIRCULA estoque -> em uso ->
--       lavanderia -> estoque. So sai de vez por perda ou avaria.
--   * Lotes com validade (para produtos que controlam validade).
--   * Movimentacoes que NUNCA sao editadas nem apagadas: erro se corrige
--     com "estorno" (um novo lancamento ao contrario).
--   * Chave anti-duplicidade: o mesmo pedido enviado 2 vezes lanca 1 vez.
--   * Estoque pode ficar NEGATIVO (a operacao nao trava) e gera alerta.
--   * Conferencia (inventario): recepcao conta, dono fecha; o fechamento
--     gera os ajustes automaticamente.
--   * CUSTOS ficam em tabelas separadas que SO O DONO le
--     (recepcao e camareira nao veem custo).
--   * Cria as categorias Enxoval, Amenities, Frigobar e Limpeza em cada
--     motel (as existentes e as novas). Nenhum produto e criado.
--
-- Rode o arquivo inteiro de uma vez no SQL Editor. O fim mostra como
-- desfazer.
-- =====================================================================


-- ---------- 1. CADASTROS ----------

create table public.stock_categories (
  id          uuid primary key default gen_random_uuid(),
  motel_id    uuid not null references public.motels(id) on delete cascade,
  name        text not null check (length(btrim(name)) between 2 and 60),
  created_at  timestamptz not null default now(),
  unique (motel_id, id)
);
create unique index stock_categories_nome on public.stock_categories (motel_id, lower(btrim(name)));

create table public.suppliers (
  id          uuid primary key default gen_random_uuid(),
  motel_id    uuid not null references public.motels(id) on delete cascade,
  name        text not null check (length(btrim(name)) between 2 and 120),
  document    text check (document is null or length(document) <= 30),   -- CNPJ/CPF
  phone       text check (phone is null or length(phone) <= 30),
  email       text check (email is null or length(email) <= 120),
  notes       text check (notes is null or length(notes) <= 500),
  active      boolean not null default true,
  created_at  timestamptz not null default now(),
  unique (motel_id, id)
);
create unique index suppliers_nome on public.suppliers (motel_id, lower(btrim(name)));

create table public.products (
  id                uuid primary key default gen_random_uuid(),
  motel_id          uuid not null references public.motels(id) on delete cascade,
  category_id       uuid not null,
  name              text not null check (length(btrim(name)) between 2 and 120),
  sku               text check (sku is null or length(sku) <= 40),
  unit              text not null default 'un' check (unit in ('un','pct','cx','par','kg','g','l','ml')),
  kind              text not null default 'consumo' check (kind in ('consumo','enxoval')),
  min_qty           numeric(12,3) not null default 0 check (min_qty >= 0),
  tracks_expiry     boolean not null default false,
  sale_price_cents  integer check (sale_price_cents is null or sale_price_cents >= 0),  -- preco de venda (frigobar)
  active            boolean not null default true,
  created_at        timestamptz not null default now(),
  unique (motel_id, id),
  foreign key (motel_id, category_id) references public.stock_categories (motel_id, id) on delete restrict,
  check (kind = 'consumo' or not tracks_expiry)   -- enxoval nao tem validade
);
create unique index products_nome on public.products (motel_id, lower(btrim(name)));
create index on public.products (motel_id, category_id);

-- Custo medio e ultimo custo: SO O DONO le.
create table public.product_costs (
  product_id       uuid primary key references public.products(id) on delete cascade,
  motel_id         uuid not null references public.motels(id) on delete cascade,
  avg_cost_cents   numeric(14,2),
  last_cost_cents  numeric(14,2),
  updated_at       timestamptz not null default now()
);


-- ---------- 2. SALDOS, LOTES E MOVIMENTACOES ----------

create table public.stock_levels (
  motel_id    uuid not null references public.motels(id) on delete cascade,
  product_id  uuid not null references public.products(id) on delete cascade,
  location    text not null check (location in ('estoque','em_uso','lavanderia')),
  qty         numeric(12,3) not null default 0,     -- pode ficar negativo (gera alerta)
  updated_at  timestamptz not null default now(),
  primary key (product_id, location)
);
create index on public.stock_levels (motel_id);

create table public.stock_lots (
  id             uuid primary key default gen_random_uuid(),
  motel_id       uuid not null references public.motels(id) on delete cascade,
  product_id     uuid not null references public.products(id) on delete cascade,
  lot_code       text check (lot_code is null or length(lot_code) <= 40),
  expires_on     date,
  qty_remaining  numeric(12,3) not null default 0 check (qty_remaining >= 0),
  created_at     timestamptz not null default now()
);
create index on public.stock_lots (motel_id, expires_on) where qty_remaining > 0;
create index on public.stock_lots (product_id);

create table public.inventory_counts (
  id          uuid primary key default gen_random_uuid(),
  motel_id    uuid not null references public.motels(id) on delete cascade,
  location    text not null check (location in ('estoque','em_uso','lavanderia')),
  status      text not null default 'aberto' check (status in ('aberto','fechado','cancelado')),
  notes       text check (notes is null or length(notes) <= 500),
  opened_by   uuid,
  opened_at   timestamptz not null default now(),
  closed_by   uuid,
  closed_at   timestamptz,
  unique (motel_id, id)
);
-- so uma conferencia aberta por local
create unique index inventory_uma_aberta on public.inventory_counts (motel_id, location) where status = 'aberto';

create table public.inventory_count_items (
  inventory_id  uuid not null references public.inventory_counts(id) on delete cascade,
  motel_id      uuid not null references public.motels(id) on delete cascade,
  product_id    uuid not null references public.products(id) on delete cascade,
  counted_qty   numeric(12,3) not null check (counted_qty >= 0),
  system_qty    numeric(12,3),          -- saldo do sistema no momento do fechamento
  counted_by    uuid,
  counted_at    timestamptz not null default now(),
  primary key (inventory_id, product_id)
);

create table public.stock_movements (
  id              uuid primary key default gen_random_uuid(),
  motel_id        uuid not null references public.motels(id) on delete cascade,
  product_id      uuid not null,
  type            text not null check (type in (
                    'entrada','consumo','uso_interno','perda','avaria','vencimento',
                    'transferencia','ajuste','estorno')),
  qty             numeric(12,3) not null check (qty > 0),
  from_location   text check (from_location in ('estoque','em_uso','lavanderia')),  -- null = de fora (compra)
  to_location     text check (to_location in ('estoque','em_uso','lavanderia')),    -- null = saiu de vez
  lot_id          uuid references public.stock_lots(id),
  supplier_id     uuid,
  invoice_number  text check (invoice_number is null or length(invoice_number) <= 60),
  reason          text check (reason is null or length(reason) <= 500),
  reverses_id     uuid references public.stock_movements(id),
  inventory_id    uuid references public.inventory_counts(id),
  created_by      uuid,
  created_at      timestamptz not null default now(),
  client_key      uuid not null,     -- chave anti-duplicidade
  unique (motel_id, client_key),
  check (from_location is not null or to_location is not null),
  foreign key (motel_id, product_id)  references public.products  (motel_id, id),
  foreign key (motel_id, supplier_id) references public.suppliers (motel_id, id)
);
create index on public.stock_movements (motel_id, created_at desc);
create index on public.stock_movements (product_id, created_at desc);
-- um lancamento so pode ser estornado uma vez
create unique index stock_movements_um_estorno on public.stock_movements (reverses_id) where reverses_id is not null;

-- quanto de cada lote cada movimentacao usou (para estornar certinho)
create table public.stock_movement_lots (
  movement_id  uuid not null references public.stock_movements(id) on delete cascade,
  lot_id       uuid not null references public.stock_lots(id),
  motel_id     uuid not null references public.motels(id) on delete cascade,
  qty          numeric(12,3) not null check (qty > 0),
  primary key (movement_id, lot_id)
);

-- custo de cada movimentacao: SO O DONO le.
create table public.stock_movement_costs (
  movement_id      uuid primary key references public.stock_movements(id) on delete cascade,
  motel_id         uuid not null references public.motels(id) on delete cascade,
  unit_cost_cents  numeric(14,2) not null,
  total_cents      numeric(16,2) not null
);


-- ---------- 3. TRAVAS ----------

-- Nao deixa trocar consumo <-> enxoval depois que o produto ja movimentou.
create or replace function public._products_guard()
returns trigger language plpgsql set search_path = public as $$
begin
  if new.kind <> old.kind
     and exists (select 1 from public.stock_movements where product_id = old.id) then
    raise exception using message = 'Este produto já tem movimentações: não dá para trocar entre consumo e enxoval.',
      errcode = 'P0001', hint = 'estoque';
  end if;
  if new.motel_id <> old.motel_id then
    raise exception 'Nao e permitido mudar o motel do produto';
  end if;
  return new;
end $$;
create trigger trg_products_guard before update on public.products
  for each row execute function public._products_guard();

-- Categorias padrao para cada motel novo.
create or replace function public._stock_default_categories()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  insert into public.stock_categories (motel_id, name)
  select new.id, n from unnest(array['Enxoval','Amenities','Frigobar','Limpeza']) as n
  on conflict do nothing;
  return new;
end $$;
revoke all on function public._stock_default_categories() from public, anon, authenticated;
create trigger trg_motels_stock_categories after insert on public.motels
  for each row execute function public._stock_default_categories();

-- ... e para os moteis que ja existem.
insert into public.stock_categories (motel_id, name)
select m.id, n from public.motels m cross join unnest(array['Enxoval','Amenities','Frigobar','Limpeza']) as n
on conflict do nothing;


-- ---------- 4. FUNCOES INTERNAS (ninguem chama direto) ----------

create or replace function public._stock_err(p_msg text)
returns void language plpgsql as $$
begin
  raise exception using message = p_msg, errcode = 'P0001', hint = 'estoque';
end $$;

create or replace function public._stock_level_add(p_motel uuid, p_product uuid, p_loc text, p_delta numeric)
returns void language plpgsql security definer set search_path = public as $$
begin
  insert into public.stock_levels (motel_id, product_id, location, qty)
  values (p_motel, p_product, p_loc, p_delta)
  on conflict (product_id, location)
  do update set qty = public.stock_levels.qty + excluded.qty, updated_at = now();
end $$;

-- Tira do(s) lote(s): primeiro o lote indicado, depois o que vence antes.
-- Se faltar saldo nos lotes, tira o que tiver (o saldo geral pode ficar negativo).
create or replace function public._stock_take_lots(p_motel uuid, p_product uuid, p_movement uuid, p_qty numeric, p_lot uuid)
returns void language plpgsql security definer set search_path = public as $$
declare
  v_left numeric := p_qty;
  v_take numeric;
  r record;
begin
  for r in
    select id, qty_remaining from public.stock_lots
    where motel_id = p_motel and product_id = p_product and qty_remaining > 0
    order by (id = p_lot) desc nulls last, expires_on nulls last, created_at
    for update
  loop
    exit when v_left <= 0;
    v_take := least(v_left, r.qty_remaining);
    update public.stock_lots set qty_remaining = qty_remaining - v_take where id = r.id;
    insert into public.stock_movement_lots (movement_id, lot_id, motel_id, qty)
    values (p_movement, r.id, p_motel, v_take);
    v_left := v_left - v_take;
  end loop;
end $$;

-- Guarda o custo da movimentacao (custo medio do momento) para o relatorio do dono.
create or replace function public._stock_snapshot_cost(p_motel uuid, p_product uuid, p_movement uuid, p_qty numeric)
returns void language plpgsql security definer set search_path = public as $$
declare v_avg numeric;
begin
  select avg_cost_cents into v_avg from public.product_costs where product_id = p_product;
  if v_avg is not null then
    insert into public.stock_movement_costs (movement_id, motel_id, unit_cost_cents, total_cents)
    values (p_movement, p_motel, v_avg, round(v_avg * p_qty, 2));
  end if;
end $$;

revoke all on function public._stock_err(text) from public, anon, authenticated;
revoke all on function public._stock_level_add(uuid, uuid, text, numeric) from public, anon, authenticated;
revoke all on function public._stock_take_lots(uuid, uuid, uuid, numeric, uuid) from public, anon, authenticated;
revoke all on function public._stock_snapshot_cost(uuid, uuid, uuid, numeric) from public, anon, authenticated;


-- ---------- 5. FUNCOES DO SISTEMA (cada uma e uma transacao unica) ----------

-- ENTRADA de mercadoria (so dono): soma no estoque, atualiza o custo medio e o lote.
create or replace function public.stock_entry(
  p_motel uuid, p_key uuid, p_product uuid, p_qty numeric, p_unit_cost_cents numeric,
  p_supplier uuid default null, p_lot_code text default null, p_expires_on date default null,
  p_invoice text default null, p_notes text default null)
returns uuid language plpgsql security definer set search_path = public as $$
declare
  v_p public.products%rowtype;
  v_id uuid;
  v_lot uuid;
  v_total numeric;
  v_avg numeric;
begin
  if not public.has_role(p_motel, array['dono']) then raise exception 'Sem permissao'; end if;
  if p_key is null then perform public._stock_err('Pedido sem identificação. Recarregue a página.'); end if;
  select * into v_p from public.products where id = p_product and motel_id = p_motel;
  if not found or not v_p.active then perform public._stock_err('Produto não encontrado ou desativado.'); end if;
  if p_qty is null or p_qty <= 0 then perform public._stock_err('A quantidade precisa ser maior que zero.'); end if;
  if p_unit_cost_cents is null or p_unit_cost_cents < 0 then perform public._stock_err('Informe o custo unitário.'); end if;
  if p_supplier is not null and not exists (
       select 1 from public.suppliers where id = p_supplier and motel_id = p_motel) then
    perform public._stock_err('Fornecedor não encontrado.');
  end if;
  if v_p.tracks_expiry and p_expires_on is null then
    perform public._stock_err('Este produto controla validade: informe a data de validade.');
  end if;

  insert into public.stock_movements
    (motel_id, product_id, type, qty, to_location, supplier_id, invoice_number, reason, created_by, client_key)
  values
    (p_motel, p_product, 'entrada', p_qty, 'estoque', p_supplier, nullif(btrim(p_invoice), ''),
     nullif(btrim(p_notes), ''), auth.uid(), p_key)
  on conflict (motel_id, client_key) do nothing
  returning id into v_id;
  if v_id is null then   -- ja lancado antes (pedido repetido)
    select id into v_id from public.stock_movements where motel_id = p_motel and client_key = p_key;
    return v_id;
  end if;

  -- custo medio ponderado (trava a linha de custo do produto)
  insert into public.product_costs (product_id, motel_id) values (p_product, p_motel) on conflict do nothing;
  select avg_cost_cents into v_avg from public.product_costs where product_id = p_product for update;
  select greatest(coalesce(sum(qty), 0), 0) into v_total from public.stock_levels where product_id = p_product;
  v_avg := case when v_avg is null or v_total = 0 then p_unit_cost_cents
                else (v_total * v_avg + p_qty * p_unit_cost_cents) / (v_total + p_qty) end;
  update public.product_costs
     set avg_cost_cents = round(v_avg, 2), last_cost_cents = p_unit_cost_cents, updated_at = now()
   where product_id = p_product;
  insert into public.stock_movement_costs (movement_id, motel_id, unit_cost_cents, total_cents)
  values (v_id, p_motel, p_unit_cost_cents, round(p_unit_cost_cents * p_qty, 2));

  -- lote (produtos de consumo com validade ou com codigo de lote)
  if v_p.kind = 'consumo' and (v_p.tracks_expiry or nullif(btrim(p_lot_code), '') is not null) then
    select id into v_lot from public.stock_lots
     where motel_id = p_motel and product_id = p_product
       and lot_code is not distinct from nullif(btrim(p_lot_code), '')
       and expires_on is not distinct from p_expires_on
     for update;
    if v_lot is null then
      insert into public.stock_lots (motel_id, product_id, lot_code, expires_on, qty_remaining)
      values (p_motel, p_product, nullif(btrim(p_lot_code), ''), p_expires_on, p_qty)
      returning id into v_lot;
    else
      update public.stock_lots set qty_remaining = qty_remaining + p_qty where id = v_lot;
    end if;
    update public.stock_movements set lot_id = v_lot where id = v_id;
    insert into public.stock_movement_lots (movement_id, lot_id, motel_id, qty) values (v_id, v_lot, p_motel, p_qty);
  end if;

  perform public._stock_level_add(p_motel, p_product, 'estoque', p_qty);
  insert into public.audit_logs (motel_id, actor_id, action, details)
  values (p_motel, auth.uid(), 'estoque_entrada', jsonb_build_object('movement', v_id, 'product', p_product, 'qty', p_qty));
  return v_id;
end $$;

-- SAIDA definitiva: consumo / uso interno (dono e recepcao);
-- perda / avaria / vencimento (so dono, com motivo).
create or replace function public.stock_exit(
  p_motel uuid, p_key uuid, p_product uuid, p_type text, p_qty numeric,
  p_location text default 'estoque', p_lot uuid default null, p_reason text default null)
returns uuid language plpgsql security definer set search_path = public as $$
declare
  v_p public.products%rowtype;
  v_id uuid;
  v_loc text := coalesce(p_location, 'estoque');
begin
  if p_type in ('consumo','uso_interno') then
    if not public.has_role(p_motel, array['dono','recepcao']) then raise exception 'Sem permissao'; end if;
  elsif p_type in ('perda','avaria','vencimento') then
    if not public.has_role(p_motel, array['dono']) then raise exception 'Sem permissao'; end if;
  else
    perform public._stock_err('Tipo de saída inválido.');
  end if;
  if p_key is null then perform public._stock_err('Pedido sem identificação. Recarregue a página.'); end if;
  select * into v_p from public.products where id = p_product and motel_id = p_motel;
  if not found then perform public._stock_err('Produto não encontrado.'); end if;
  if p_qty is null or p_qty <= 0 then perform public._stock_err('A quantidade precisa ser maior que zero.'); end if;
  if v_loc not in ('estoque','em_uso','lavanderia') then perform public._stock_err('Local inválido.'); end if;
  if v_p.kind = 'consumo' and v_loc <> 'estoque' then
    perform public._stock_err('Produto de consumo só fica no estoque.');
  end if;
  if v_p.kind = 'enxoval' and p_type not in ('perda','avaria') then
    perform public._stock_err('Enxoval circula (envio, lavanderia, retorno). Baixa definitiva só por perda ou avaria.');
  end if;
  if p_type in ('perda','avaria','vencimento') and length(btrim(coalesce(p_reason, ''))) < 3 then
    perform public._stock_err('Informe o motivo.');
  end if;
  if p_lot is not null and not exists (
       select 1 from public.stock_lots where id = p_lot and product_id = p_product and motel_id = p_motel) then
    perform public._stock_err('Lote não encontrado.');
  end if;

  insert into public.stock_movements
    (motel_id, product_id, type, qty, from_location, lot_id, reason, created_by, client_key)
  values
    (p_motel, p_product, p_type, p_qty, v_loc, p_lot, nullif(btrim(p_reason), ''), auth.uid(), p_key)
  on conflict (motel_id, client_key) do nothing
  returning id into v_id;
  if v_id is null then
    select id into v_id from public.stock_movements where motel_id = p_motel and client_key = p_key;
    return v_id;
  end if;

  perform public._stock_snapshot_cost(p_motel, p_product, v_id, p_qty);
  if v_p.kind = 'consumo' then
    perform public._stock_take_lots(p_motel, p_product, v_id, p_qty, p_lot);
  end if;
  perform public._stock_level_add(p_motel, p_product, v_loc, -p_qty);
  insert into public.audit_logs (motel_id, actor_id, action, details)
  values (p_motel, auth.uid(), 'estoque_saida',
          jsonb_build_object('movement', v_id, 'product', p_product, 'type', p_type, 'qty', p_qty));
  return v_id;
end $$;

-- TRANSFERENCIA de enxoval entre locais (dono e recepcao).
create or replace function public.stock_transfer(
  p_motel uuid, p_key uuid, p_product uuid, p_qty numeric, p_from text, p_to text, p_notes text default null)
returns uuid language plpgsql security definer set search_path = public as $$
declare
  v_p public.products%rowtype;
  v_id uuid;
begin
  if not public.has_role(p_motel, array['dono','recepcao']) then raise exception 'Sem permissao'; end if;
  if p_key is null then perform public._stock_err('Pedido sem identificação. Recarregue a página.'); end if;
  select * into v_p from public.products where id = p_product and motel_id = p_motel;
  if not found then perform public._stock_err('Produto não encontrado.'); end if;
  if v_p.kind <> 'enxoval' then perform public._stock_err('Só enxoval circula entre estoque, suítes e lavanderia.'); end if;
  if p_qty is null or p_qty <= 0 then perform public._stock_err('A quantidade precisa ser maior que zero.'); end if;
  if p_from not in ('estoque','em_uso','lavanderia') or p_to not in ('estoque','em_uso','lavanderia') or p_from = p_to then
    perform public._stock_err('Escolha locais de origem e destino diferentes.');
  end if;

  insert into public.stock_movements
    (motel_id, product_id, type, qty, from_location, to_location, reason, created_by, client_key)
  values
    (p_motel, p_product, 'transferencia', p_qty, p_from, p_to, nullif(btrim(p_notes), ''), auth.uid(), p_key)
  on conflict (motel_id, client_key) do nothing
  returning id into v_id;
  if v_id is null then
    select id into v_id from public.stock_movements where motel_id = p_motel and client_key = p_key;
    return v_id;
  end if;

  perform public._stock_level_add(p_motel, p_product, p_from, -p_qty);
  perform public._stock_level_add(p_motel, p_product, p_to, p_qty);
  insert into public.audit_logs (motel_id, actor_id, action, details)
  values (p_motel, auth.uid(), 'estoque_transferencia',
          jsonb_build_object('movement', v_id, 'product', p_product, 'from', p_from, 'to', p_to, 'qty', p_qty));
  return v_id;
end $$;

-- ESTORNO (so dono): lanca o contrario de um lancamento. O original fica no historico.
create or replace function public.stock_reverse(p_motel uuid, p_key uuid, p_movement uuid, p_reason text)
returns uuid language plpgsql security definer set search_path = public as $$
declare
  v_o public.stock_movements%rowtype;
  v_id uuid;
  v_cost numeric;
  v_avg numeric;
  v_total numeric;
  r record;
begin
  if not public.has_role(p_motel, array['dono']) then raise exception 'Sem permissao'; end if;
  if p_key is null then perform public._stock_err('Pedido sem identificação. Recarregue a página.'); end if;
  if length(btrim(coalesce(p_reason, ''))) < 3 then perform public._stock_err('Informe o motivo do estorno.'); end if;

  -- pedido repetido?
  select id into v_id from public.stock_movements where motel_id = p_motel and client_key = p_key;
  if v_id is not null then return v_id; end if;

  select * into v_o from public.stock_movements where id = p_movement and motel_id = p_motel for update;
  if not found then perform public._stock_err('Lançamento não encontrado.'); end if;
  if v_o.type = 'estorno' then perform public._stock_err('Um estorno não pode ser estornado.'); end if;
  if exists (select 1 from public.stock_movements where reverses_id = p_movement) then
    perform public._stock_err('Este lançamento já foi estornado.');
  end if;

  insert into public.stock_movements
    (motel_id, product_id, type, qty, from_location, to_location, lot_id, reason, reverses_id, created_by, client_key)
  values
    (p_motel, v_o.product_id, 'estorno', v_o.qty, v_o.to_location, v_o.from_location, v_o.lot_id,
     btrim(p_reason), p_movement, auth.uid(), p_key)
  returning id into v_id;

  -- lotes: devolve exatamente o que o original mexeu
  for r in select lot_id, qty from public.stock_movement_lots where movement_id = p_movement loop
    if v_o.to_location is not null and v_o.from_location is null then
      -- original ENTROU no lote -> tira (sem deixar negativo)
      update public.stock_lots set qty_remaining = greatest(qty_remaining - r.qty, 0) where id = r.lot_id;
    else
      -- original SAIU do lote -> devolve
      update public.stock_lots set qty_remaining = qty_remaining + r.qty where id = r.lot_id;
    end if;
    insert into public.stock_movement_lots (movement_id, lot_id, motel_id, qty) values (v_id, r.lot_id, p_motel, r.qty);
  end loop;

  -- custo: o estorno usa o mesmo custo do original; estorno de ENTRADA recalcula o custo medio
  select unit_cost_cents into v_cost from public.stock_movement_costs where movement_id = p_movement;
  if v_cost is not null then
    insert into public.stock_movement_costs (movement_id, motel_id, unit_cost_cents, total_cents)
    values (v_id, p_motel, v_cost, round(v_cost * v_o.qty, 2));
  end if;
  if v_o.type = 'entrada' and v_cost is not null then
    select avg_cost_cents into v_avg from public.product_costs where product_id = v_o.product_id for update;
    select greatest(coalesce(sum(qty), 0), 0) into v_total from public.stock_levels where product_id = v_o.product_id;
    if v_avg is not null and v_total - v_o.qty > 0 then
      update public.product_costs
         set avg_cost_cents = round((v_total * v_avg - v_o.qty * v_cost) / (v_total - v_o.qty), 2), updated_at = now()
       where product_id = v_o.product_id;
    end if;
  end if;

  if v_o.to_location is not null then
    perform public._stock_level_add(p_motel, v_o.product_id, v_o.to_location, -v_o.qty);
  end if;
  if v_o.from_location is not null then
    perform public._stock_level_add(p_motel, v_o.product_id, v_o.from_location, v_o.qty);
  end if;
  insert into public.audit_logs (motel_id, actor_id, action, details)
  values (p_motel, auth.uid(), 'estoque_estorno', jsonb_build_object('movement', v_id, 'reverses', p_movement));
  return v_id;
end $$;

-- CONFERENCIA (inventario): abrir (dono e recepcao)
create or replace function public.inventory_open(p_motel uuid, p_location text, p_notes text default null)
returns uuid language plpgsql security definer set search_path = public as $$
declare v_id uuid;
begin
  if not public.has_role(p_motel, array['dono','recepcao']) then raise exception 'Sem permissao'; end if;
  if p_location not in ('estoque','em_uso','lavanderia') then perform public._stock_err('Local inválido.'); end if;
  if exists (select 1 from public.inventory_counts where motel_id = p_motel and location = p_location and status = 'aberto') then
    perform public._stock_err('Já existe uma conferência aberta para este local.');
  end if;
  insert into public.inventory_counts (motel_id, location, notes, opened_by)
  values (p_motel, p_location, nullif(btrim(p_notes), ''), auth.uid())
  returning id into v_id;
  insert into public.audit_logs (motel_id, actor_id, action, details)
  values (p_motel, auth.uid(), 'inventario_aberto', jsonb_build_object('inventory', v_id, 'location', p_location));
  return v_id;
exception when unique_violation then
  perform public._stock_err('Já existe uma conferência aberta para este local.');
  return null;
end $$;

-- CONFERENCIA: registrar a contagem de um produto (dono e recepcao). Pode corrigir enquanto aberta.
create or replace function public.inventory_count(p_motel uuid, p_inventory uuid, p_product uuid, p_qty numeric)
returns void language plpgsql security definer set search_path = public as $$
declare
  v_inv public.inventory_counts%rowtype;
  v_p public.products%rowtype;
begin
  if not public.has_role(p_motel, array['dono','recepcao']) then raise exception 'Sem permissao'; end if;
  select * into v_inv from public.inventory_counts where id = p_inventory and motel_id = p_motel;
  if not found or v_inv.status <> 'aberto' then perform public._stock_err('Conferência não está aberta.'); end if;
  select * into v_p from public.products where id = p_product and motel_id = p_motel;
  if not found then perform public._stock_err('Produto não encontrado.'); end if;
  if v_p.kind = 'consumo' and v_inv.location <> 'estoque' then
    perform public._stock_err('Produto de consumo só é conferido no estoque.');
  end if;
  if p_qty is null or p_qty < 0 then perform public._stock_err('A quantidade contada não pode ser negativa.'); end if;
  insert into public.inventory_count_items (inventory_id, motel_id, product_id, counted_qty, counted_by)
  values (p_inventory, p_motel, p_product, p_qty, auth.uid())
  on conflict (inventory_id, product_id)
  do update set counted_qty = excluded.counted_qty, counted_by = excluded.counted_by, counted_at = now();
end $$;

-- CONFERENCIA: fechar (so dono). Gera um AJUSTE para cada diferenca. Devolve quantos ajustes.
create or replace function public.inventory_close(p_motel uuid, p_inventory uuid)
returns integer language plpgsql security definer set search_path = public as $$
declare
  v_inv public.inventory_counts%rowtype;
  v_sys numeric;
  v_diff numeric;
  v_mov uuid;
  v_kind text;
  v_n integer := 0;
  r record;
begin
  if not public.has_role(p_motel, array['dono']) then raise exception 'Sem permissao'; end if;
  select * into v_inv from public.inventory_counts where id = p_inventory and motel_id = p_motel for update;
  if not found or v_inv.status <> 'aberto' then perform public._stock_err('Conferência não está aberta.'); end if;
  if not exists (select 1 from public.inventory_count_items where inventory_id = p_inventory) then
    perform public._stock_err('Nenhum produto foi contado.');
  end if;

  for r in select product_id, counted_qty from public.inventory_count_items where inventory_id = p_inventory loop
    select coalesce(qty, 0) into v_sys from public.stock_levels
     where product_id = r.product_id and location = v_inv.location for update;
    v_sys := coalesce(v_sys, 0);
    v_diff := r.counted_qty - v_sys;
    update public.inventory_count_items set system_qty = v_sys
     where inventory_id = p_inventory and product_id = r.product_id;
    if v_diff <> 0 then
      insert into public.stock_movements
        (motel_id, product_id, type, qty, from_location, to_location, reason, inventory_id, created_by, client_key)
      values
        (p_motel, r.product_id, 'ajuste', abs(v_diff),
         case when v_diff < 0 then v_inv.location end,
         case when v_diff > 0 then v_inv.location end,
         'Conferência', p_inventory, auth.uid(), gen_random_uuid())
      returning id into v_mov;
      perform public._stock_snapshot_cost(p_motel, r.product_id, v_mov, abs(v_diff));
      select kind into v_kind from public.products where id = r.product_id;
      if v_diff < 0 and v_kind = 'consumo' then
        perform public._stock_take_lots(p_motel, r.product_id, v_mov, abs(v_diff), null);
      end if;
      perform public._stock_level_add(p_motel, r.product_id, v_inv.location, v_diff);
      v_n := v_n + 1;
    end if;
  end loop;

  update public.inventory_counts set status = 'fechado', closed_by = auth.uid(), closed_at = now() where id = p_inventory;
  insert into public.audit_logs (motel_id, actor_id, action, details)
  values (p_motel, auth.uid(), 'inventario_fechado', jsonb_build_object('inventory', p_inventory, 'ajustes', v_n));
  return v_n;
end $$;

-- CONFERENCIA: cancelar (so dono). Nada e ajustado.
create or replace function public.inventory_cancel(p_motel uuid, p_inventory uuid)
returns void language plpgsql security definer set search_path = public as $$
begin
  if not public.has_role(p_motel, array['dono']) then raise exception 'Sem permissao'; end if;
  update public.inventory_counts set status = 'cancelado', closed_by = auth.uid(), closed_at = now()
   where id = p_inventory and motel_id = p_motel and status = 'aberto';
  if not found then perform public._stock_err('Conferência não está aberta.'); end if;
  insert into public.audit_logs (motel_id, actor_id, action, details)
  values (p_motel, auth.uid(), 'inventario_cancelado', jsonb_build_object('inventory', p_inventory));
end $$;

-- ALERTAS (toda a equipe do motel): abaixo do minimo, negativo, vencendo (15 dias) e vencido.
create or replace function public.stock_alerts(p_motel uuid)
returns table (kind text, product_id uuid, product_name text, location text, qty numeric,
               min_qty numeric, unit text, lot_code text, expires_on date)
language plpgsql stable security definer set search_path = public as $$
#variable_conflict use_column
declare v_today date;
begin
  if not public.is_member(p_motel) then raise exception 'Sem permissao'; end if;
  select (now() at time zone m.timezone)::date into v_today from public.motels m where m.id = p_motel;

  return query
  select 'negativo'::text, p.id, p.name, l.location, l.qty, p.min_qty, p.unit, null::text, null::date
    from public.stock_levels l join public.products p on p.id = l.product_id
   where l.motel_id = p_motel and l.qty < 0
  union all
  select 'abaixo_minimo', p.id, p.name, 'estoque', coalesce(l.qty, 0), p.min_qty, p.unit, null, null
    from public.products p
    left join public.stock_levels l on l.product_id = p.id and l.location = 'estoque'
   where p.motel_id = p_motel and p.active and p.min_qty > 0
     and coalesce(l.qty, 0) >= 0 and coalesce(l.qty, 0) <= p.min_qty
  union all
  select case when s.expires_on < v_today then 'vencido' else 'vencendo' end,
         p.id, p.name, 'estoque', s.qty_remaining, p.min_qty, p.unit, s.lot_code, s.expires_on
    from public.stock_lots s join public.products p on p.id = s.product_id
   where s.motel_id = p_motel and s.qty_remaining > 0 and s.expires_on is not null
     and s.expires_on <= v_today + 15;
end $$;

revoke all on function public.stock_entry(uuid, uuid, uuid, numeric, numeric, uuid, text, date, text, text) from public, anon;
revoke all on function public.stock_exit(uuid, uuid, uuid, text, numeric, text, uuid, text) from public, anon;
revoke all on function public.stock_transfer(uuid, uuid, uuid, numeric, text, text, text) from public, anon;
revoke all on function public.stock_reverse(uuid, uuid, uuid, text) from public, anon;
revoke all on function public.inventory_open(uuid, text, text) from public, anon;
revoke all on function public.inventory_count(uuid, uuid, uuid, numeric) from public, anon;
revoke all on function public.inventory_close(uuid, uuid) from public, anon;
revoke all on function public.inventory_cancel(uuid, uuid) from public, anon;
revoke all on function public.stock_alerts(uuid) from public, anon;
grant execute on function public.stock_entry(uuid, uuid, uuid, numeric, numeric, uuid, text, date, text, text) to authenticated;
grant execute on function public.stock_exit(uuid, uuid, uuid, text, numeric, text, uuid, text) to authenticated;
grant execute on function public.stock_transfer(uuid, uuid, uuid, numeric, text, text, text) to authenticated;
grant execute on function public.stock_reverse(uuid, uuid, uuid, text) to authenticated;
grant execute on function public.inventory_open(uuid, text, text) to authenticated;
grant execute on function public.inventory_count(uuid, uuid, uuid, numeric) to authenticated;
grant execute on function public.inventory_close(uuid, uuid) to authenticated;
grant execute on function public.inventory_cancel(uuid, uuid) to authenticated;
grant execute on function public.stock_alerts(uuid) to authenticated;


-- ---------- 6. SEGURANCA POR LINHA (RLS) ----------

alter table public.stock_categories       enable row level security;
alter table public.suppliers              enable row level security;
alter table public.products               enable row level security;
alter table public.product_costs          enable row level security;
alter table public.stock_levels           enable row level security;
alter table public.stock_lots             enable row level security;
alter table public.stock_movements        enable row level security;
alter table public.stock_movement_lots    enable row level security;
alter table public.stock_movement_costs   enable row level security;
alter table public.inventory_counts       enable row level security;
alter table public.inventory_count_items  enable row level security;

-- cadastros: toda a equipe ve categorias e produtos; so o dono altera
create policy stock_categories_select on public.stock_categories for select to authenticated
  using (public.is_member(motel_id));
create policy stock_categories_write on public.stock_categories for all to authenticated
  using (public.has_role(motel_id, array['dono'])) with check (public.has_role(motel_id, array['dono']));
create policy products_select on public.products for select to authenticated
  using (public.is_member(motel_id));
create policy products_write on public.products for all to authenticated
  using (public.has_role(motel_id, array['dono'])) with check (public.has_role(motel_id, array['dono']));
-- fornecedores: so o dono
create policy suppliers_all on public.suppliers for all to authenticated
  using (public.has_role(motel_id, array['dono'])) with check (public.has_role(motel_id, array['dono']));

-- custos: so o dono (leitura). Ninguem grava direto.
create policy product_costs_select on public.product_costs for select to authenticated
  using (public.has_role(motel_id, array['dono']));
create policy stock_movement_costs_select on public.stock_movement_costs for select to authenticated
  using (public.has_role(motel_id, array['dono']));

-- saldos e lotes: toda a equipe ve (camareira inclusive, sem custo)
create policy stock_levels_select on public.stock_levels for select to authenticated
  using (public.is_member(motel_id));
create policy stock_lots_select on public.stock_lots for select to authenticated
  using (public.is_member(motel_id));

-- historico e conferencias: dono e recepcao
create policy stock_movements_select on public.stock_movements for select to authenticated
  using (public.has_role(motel_id, array['dono','recepcao']));
create policy stock_movement_lots_select on public.stock_movement_lots for select to authenticated
  using (public.has_role(motel_id, array['dono','recepcao']));
create policy inventory_counts_select on public.inventory_counts for select to authenticated
  using (public.has_role(motel_id, array['dono','recepcao']));
create policy inventory_count_items_select on public.inventory_count_items for select to authenticated
  using (public.has_role(motel_id, array['dono','recepcao']));


-- ---------- 7. PERMISSOES DE TABELA ----------
-- Visitantes (anon) nao acessam nada. Saldos, lotes, movimentacoes e
-- conferencias so mudam pelas funcoes acima (ninguem edita nem apaga).

revoke all on public.stock_categories, public.suppliers, public.products, public.product_costs,
              public.stock_levels, public.stock_lots, public.stock_movements, public.stock_movement_lots,
              public.stock_movement_costs, public.inventory_counts, public.inventory_count_items
  from anon, authenticated;
grant select, insert, update, delete on public.stock_categories to authenticated;
grant select, insert, update, delete on public.suppliers        to authenticated;
grant select, insert, update         on public.products         to authenticated;
grant select on public.product_costs, public.stock_levels, public.stock_lots, public.stock_movements,
                public.stock_movement_lots, public.stock_movement_costs, public.inventory_counts,
                public.inventory_count_items
  to authenticated;


-- =====================================================================
-- COMO DESFAZER (apaga TODO o estoque cadastrado!). Copie e rode so se
-- tiver certeza:
--
-- drop function if exists public.stock_alerts(uuid), public.inventory_cancel(uuid, uuid),
--   public.inventory_close(uuid, uuid), public.inventory_count(uuid, uuid, uuid, numeric),
--   public.inventory_open(uuid, text, text), public.stock_reverse(uuid, uuid, uuid, text),
--   public.stock_transfer(uuid, uuid, uuid, numeric, text, text, text),
--   public.stock_exit(uuid, uuid, uuid, text, numeric, text, uuid, text),
--   public.stock_entry(uuid, uuid, uuid, numeric, numeric, uuid, text, date, text, text),
--   public._stock_snapshot_cost(uuid, uuid, uuid, numeric), public._stock_take_lots(uuid, uuid, uuid, numeric, uuid),
--   public._stock_level_add(uuid, uuid, text, numeric), public._stock_err(text);
-- drop trigger if exists trg_motels_stock_categories on public.motels;
-- drop function if exists public._stock_default_categories();
-- drop table if exists public.stock_movement_costs, public.stock_movement_lots, public.stock_movements,
--   public.inventory_count_items, public.inventory_counts, public.stock_lots, public.stock_levels,
--   public.product_costs, public.products, public.suppliers, public.stock_categories;
-- drop function if exists public._products_guard();
-- =====================================================================
