-- =====================================================================
-- ETAPA 5 | Operacao: limpeza, kits por categoria e conta da hospedagem
--          (Fase 1B)
--
-- PRE-REQUISITO: 01, 02, 03 e 04 ja executados.
--
-- O QUE FAZ:
--   * Categorias de suite (tabela propria) + ligacao OPCIONAL em suites.
--     JUSTIFICATIVA: o kit padrao (o que se repoe a cada limpeza) e por
--     categoria, e "suites.type" e texto livre ("Luxo", "luxo ", "LUXO").
--     MIGRACAO: cria uma categoria para cada tipo ja usado em cada motel
--     (ignorando maiusculas e espacos) e liga as suites a ela. A coluna
--     "type" NAO e alterada nem apagada; nenhum dado e perdido.
--   * Kit padrao por categoria: enxoval trocado e amenities repostos a cada
--     limpeza (baixa automatica no estoque).
--   * Tarefas de limpeza: criadas SOZINHAS quando a reserva vai para
--     "concluida" (saida), ou pedidas pela recepcao. A camareira inicia,
--     informa o consumo do frigobar e libera a suite. "Problema" segura a
--     suite ate o dono ou a recepcao resolver.
--   * Conta da hospedagem: consumos lancados na reserva (pela recepcao ou
--     informados pela camareira), com baixa no estoque. Nada e apagado:
--     correcao e estorno (so o dono).
--   * A camareira continua SEM acesso as reservas e aos custos.
--
-- Rode o arquivo inteiro de uma vez. O fim mostra como desfazer.
-- =====================================================================


-- ---------- 1. CATEGORIAS DE SUITE E KITS ----------

create table public.suite_categories (
  id          uuid primary key default gen_random_uuid(),
  motel_id    uuid not null references public.motels(id) on delete cascade,
  name        text not null check (length(btrim(name)) between 2 and 60),
  created_at  timestamptz not null default now(),
  unique (motel_id, id)
);
create unique index suite_categories_nome on public.suite_categories (motel_id, lower(btrim(name)));

alter table public.suites add column if not exists category_id uuid;
alter table public.suites add constraint suites_category_fk
  foreign key (motel_id, category_id) references public.suite_categories (motel_id, id) on delete set null (category_id);

-- migracao: uma categoria por tipo ja usado; liga as suites (type continua igual)
insert into public.suite_categories (motel_id, name)
select distinct on (motel_id, lower(btrim(type))) motel_id, btrim(type)
  from public.suites
 where length(btrim(type)) >= 2
 order by motel_id, lower(btrim(type)), btrim(type)
on conflict do nothing;
update public.suites s
   set category_id = c.id
  from public.suite_categories c
 where c.motel_id = s.motel_id and lower(btrim(c.name)) = lower(btrim(s.type)) and s.category_id is null;

create table public.suite_category_kits (
  category_id  uuid not null references public.suite_categories(id) on delete cascade,
  product_id   uuid not null references public.products(id) on delete cascade,
  motel_id     uuid not null references public.motels(id) on delete cascade,
  qty          numeric(12,3) not null check (qty > 0),
  primary key (category_id, product_id),
  foreign key (motel_id, category_id) references public.suite_categories (motel_id, id) on delete cascade,
  foreign key (motel_id, product_id)  references public.products (motel_id, id) on delete cascade
);


-- ---------- 2. TAREFAS DE LIMPEZA ----------

create table public.housekeeping_tasks (
  id              uuid primary key default gen_random_uuid(),
  motel_id        uuid not null references public.motels(id) on delete cascade,
  suite_id        uuid not null,
  reservation_id  uuid references public.reservations(id) on delete set null,
  status          text not null default 'aguardando'
                  check (status in ('aguardando','em_limpeza','problema','concluida','cancelada')),
  origin          text not null default 'saida' check (origin in ('saida','pedido')),
  checkout_at     timestamptz not null default now(),
  requested_by    uuid,
  started_by      uuid,
  started_at      timestamptz,
  finished_by     uuid,
  finished_at     timestamptz,
  condition       text check (condition in ('ok','observacoes','problema')),
  notes           text check (notes is null or length(notes) <= 1000),
  resolved_by     uuid,
  resolved_at     timestamptz,
  resolution      text check (resolution is null or length(resolution) <= 1000),
  finish_key      uuid,
  created_at      timestamptz not null default now(),
  foreign key (motel_id, suite_id) references public.suites (motel_id, id) on delete cascade
);
-- uma tarefa em aberto por suite
create unique index housekeeping_uma_aberta on public.housekeeping_tasks (suite_id)
  where status in ('aguardando','em_limpeza','problema');
create index on public.housekeeping_tasks (motel_id, created_at desc);


-- ---------- 3. CONTA DA HOSPEDAGEM ----------

create table public.reservation_charges (
  id                 uuid primary key default gen_random_uuid(),
  motel_id           uuid not null references public.motels(id) on delete cascade,
  reservation_id     uuid not null references public.reservations(id) on delete cascade,
  product_id         uuid references public.products(id),
  description        text not null check (length(btrim(description)) between 2 and 120),
  qty                numeric(12,3) not null check (qty > 0),
  unit_price_cents   integer not null check (unit_price_cents >= 0),
  total_cents        integer not null,             -- negativo no estorno
  source             text not null check (source in ('recepcao','camareira','estorno')),
  stock_movement_id  uuid references public.stock_movements(id),
  reverses_id        uuid references public.reservation_charges(id),
  task_id            uuid references public.housekeeping_tasks(id) on delete set null,
  created_by         uuid,
  created_at         timestamptz not null default now(),
  client_key         uuid not null,
  unique (motel_id, client_key)
);
create index on public.reservation_charges (reservation_id);
create unique index reservation_charges_um_estorno on public.reservation_charges (reverses_id) where reverses_id is not null;


-- ---------- 4. FUNCOES INTERNAS DE ESTOQUE (sem conferir perfil: so
--              chamadas de dentro das funcoes abaixo, que ja conferem) ----------

-- chave derivada: a mesma tarefa repetida gera as mesmas chaves (anti-duplicidade)
create or replace function public._derived_key(p_key uuid, p_part text)
returns uuid language sql immutable as $$
  select md5(p_key::text || ':' || p_part)::uuid;
$$;

create or replace function public._stock_exit_core(
  p_motel uuid, p_key uuid, p_product uuid, p_type text, p_qty numeric, p_loc text, p_reason text)
returns uuid language plpgsql security definer set search_path = public as $$
declare v_id uuid; v_kind text;
begin
  select kind into v_kind from public.products where id = p_product and motel_id = p_motel;
  if v_kind is null then perform public._stock_err('Produto não encontrado.'); end if;
  insert into public.stock_movements (motel_id, product_id, type, qty, from_location, reason, created_by, client_key)
  values (p_motel, p_product, p_type, p_qty, p_loc, p_reason, auth.uid(), p_key)
  on conflict (motel_id, client_key) do nothing
  returning id into v_id;
  if v_id is null then
    select id into v_id from public.stock_movements where motel_id = p_motel and client_key = p_key;
    return v_id;
  end if;
  perform public._stock_snapshot_cost(p_motel, p_product, v_id, p_qty);
  if v_kind = 'consumo' then perform public._stock_take_lots(p_motel, p_product, v_id, p_qty, null); end if;
  perform public._stock_level_add(p_motel, p_product, p_loc, -p_qty);
  return v_id;
end $$;

create or replace function public._stock_transfer_core(
  p_motel uuid, p_key uuid, p_product uuid, p_qty numeric, p_from text, p_to text, p_reason text)
returns uuid language plpgsql security definer set search_path = public as $$
declare v_id uuid;
begin
  insert into public.stock_movements (motel_id, product_id, type, qty, from_location, to_location, reason, created_by, client_key)
  values (p_motel, p_product, 'transferencia', p_qty, p_from, p_to, p_reason, auth.uid(), p_key)
  on conflict (motel_id, client_key) do nothing
  returning id into v_id;
  if v_id is null then
    select id into v_id from public.stock_movements where motel_id = p_motel and client_key = p_key;
    return v_id;
  end if;
  perform public._stock_level_add(p_motel, p_product, p_from, -p_qty);
  perform public._stock_level_add(p_motel, p_product, p_to, p_qty);
  return v_id;
end $$;

revoke all on function public._derived_key(uuid, text) from public, anon, authenticated;
revoke all on function public._stock_exit_core(uuid, uuid, uuid, text, numeric, text, text) from public, anon, authenticated;
revoke all on function public._stock_transfer_core(uuid, uuid, uuid, numeric, text, text, text) from public, anon, authenticated;


-- ---------- 5. SAIDA DA RESERVA -> TAREFA DE LIMPEZA (automatico) ----------

create or replace function public._reservation_checkout_task()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if new.status = 'concluida' and old.status is distinct from 'concluida' then
    insert into public.housekeeping_tasks (motel_id, suite_id, reservation_id, origin, requested_by)
    values (new.motel_id, new.suite_id, new.id, 'saida', auth.uid())
    on conflict do nothing;   -- a suite ja tem uma limpeza em aberto
  end if;
  return new;
end $$;
revoke all on function public._reservation_checkout_task() from public, anon, authenticated;
create trigger trg_reservation_checkout_task after update of status on public.reservations
  for each row execute function public._reservation_checkout_task();


-- ---------- 6. FUNCOES DA LIMPEZA ----------

-- Pedir limpeza de uma suite (dono e recepcao), ex.: cliente sem reserva no sistema.
create or replace function public.housekeeping_request(p_motel uuid, p_suite uuid, p_notes text default null)
returns uuid language plpgsql security definer set search_path = public as $$
declare v_id uuid;
begin
  if not public.has_role(p_motel, array['dono','recepcao']) then raise exception 'Sem permissao'; end if;
  if not exists (select 1 from public.suites where id = p_suite and motel_id = p_motel) then
    perform public._stock_err('Suíte não encontrada.');
  end if;
  insert into public.housekeeping_tasks (motel_id, suite_id, origin, requested_by, notes)
  values (p_motel, p_suite, 'pedido', auth.uid(), nullif(btrim(p_notes), ''))
  returning id into v_id;
  insert into public.audit_logs (motel_id, actor_id, action, details)
  values (p_motel, auth.uid(), 'limpeza_pedida', jsonb_build_object('task', v_id, 'suite', p_suite));
  return v_id;
exception when unique_violation then
  perform public._stock_err('Esta suíte já tem uma limpeza em aberto.');
  return null;
end $$;

-- Iniciar (toda a equipe).
create or replace function public.housekeeping_start(p_motel uuid, p_task uuid)
returns void language plpgsql security definer set search_path = public as $$
begin
  if not public.is_member(p_motel) then raise exception 'Sem permissao'; end if;
  update public.housekeeping_tasks
     set status = 'em_limpeza', started_by = auth.uid(), started_at = now()
   where id = p_task and motel_id = p_motel and status = 'aguardando';
  if not found then perform public._stock_err('Esta limpeza já foi iniciada ou encerrada. Atualize a página.'); end if;
  insert into public.audit_logs (motel_id, actor_id, action, details)
  values (p_motel, auth.uid(), 'limpeza_iniciada', jsonb_build_object('task', p_task));
end $$;

-- Liberar a suite (toda a equipe). Numa transacao unica:
--   * consumo do frigobar informado: baixa no estoque + lanca na conta da
--     reserva (preco de venda), se a limpeza veio de uma saida de reserva;
--   * kit padrao (se pedido): troca do enxoval (estoque -> suite -> lavanderia)
--     e baixa dos amenities;
--   * condicao: "ok"/"observacoes" libera; "problema" segura a suite.
-- p_items: [{"product_id": "...", "qty": 2}, ...]
create or replace function public.housekeeping_finish(
  p_motel uuid, p_task uuid, p_key uuid, p_condition text, p_notes text default null,
  p_restock boolean default true, p_items jsonb default '[]'::jsonb)
returns text language plpgsql security definer set search_path = public as $$
declare
  t public.housekeeping_tasks%rowtype;
  v_suite text;
  v_cat uuid;
  v_p public.products%rowtype;
  v_mov uuid;
  v_qty numeric;
  v_res_status text;
  v_new text;
  it jsonb;
  k record;
begin
  if not public.is_member(p_motel) then raise exception 'Sem permissao'; end if;
  if p_key is null then perform public._stock_err('Pedido sem identificação. Recarregue a página.'); end if;
  if p_condition not in ('ok','observacoes','problema') then perform public._stock_err('Informe o estado da suíte.'); end if;
  if p_condition <> 'ok' and length(btrim(coalesce(p_notes, ''))) < 3 then
    perform public._stock_err('Descreva a observação ou o problema.');
  end if;
  if jsonb_typeof(coalesce(p_items, '[]'::jsonb)) <> 'array' or jsonb_array_length(coalesce(p_items, '[]'::jsonb)) > 50 then
    perform public._stock_err('Lista de itens inválida.');
  end if;

  select * into t from public.housekeeping_tasks where id = p_task and motel_id = p_motel for update;
  if not found then perform public._stock_err('Limpeza não encontrada.'); end if;
  if t.status not in ('aguardando','em_limpeza') then
    if t.finish_key = p_key then return t.status; end if;   -- pedido repetido
    perform public._stock_err('Esta limpeza já foi encerrada. Atualize a página.');
  end if;
  select number, category_id into v_suite, v_cat from public.suites where id = t.suite_id;
  if t.reservation_id is not null then
    select status into v_res_status from public.reservations where id = t.reservation_id;
  end if;

  -- consumo informado (frigobar etc.)
  for it in select * from jsonb_array_elements(coalesce(p_items, '[]'::jsonb)) loop
    begin
      v_qty := (it->>'qty')::numeric;
    exception when others then
      perform public._stock_err('Quantidade inválida.');
    end;
    if v_qty is null or v_qty <= 0 or v_qty > 1000 then perform public._stock_err('Quantidade inválida.'); end if;
    select * into v_p from public.products where id = (it->>'product_id')::uuid and motel_id = p_motel;
    if not found or v_p.kind <> 'consumo' then perform public._stock_err('Item consumido inválido.'); end if;
    v_mov := public._stock_exit_core(p_motel, public._derived_key(p_key, 'c:' || v_p.id), v_p.id, 'consumo', v_qty,
                                     'estoque', 'Consumo na suíte ' || v_suite);
    if t.reservation_id is not null and v_p.sale_price_cents is not null and v_res_status in ('chegou','concluida') then
      insert into public.reservation_charges
        (motel_id, reservation_id, product_id, description, qty, unit_price_cents, total_cents, source,
         stock_movement_id, task_id, created_by, client_key)
      values
        (p_motel, t.reservation_id, v_p.id, v_p.name, v_qty, v_p.sale_price_cents, round(v_qty * v_p.sale_price_cents),
         'camareira', v_mov, p_task, auth.uid(), public._derived_key(p_key, 'q:' || v_p.id))
      on conflict (motel_id, client_key) do nothing;
    end if;
  end loop;

  -- kit padrao da categoria da suite
  if p_restock and v_cat is not null then
    for k in
      select kt.product_id, kt.qty, p.kind from public.suite_category_kits kt
        join public.products p on p.id = kt.product_id
       where kt.category_id = v_cat and p.active
    loop
      if k.kind = 'enxoval' then
        perform public._stock_transfer_core(p_motel, public._derived_key(p_key, 'e1:' || k.product_id), k.product_id, k.qty,
                                            'estoque', 'em_uso', 'Troca de enxoval: suíte ' || v_suite);
        perform public._stock_transfer_core(p_motel, public._derived_key(p_key, 'e2:' || k.product_id), k.product_id, k.qty,
                                            'em_uso', 'lavanderia', 'Enxoval usado: suíte ' || v_suite);
      else
        perform public._stock_exit_core(p_motel, public._derived_key(p_key, 'k:' || k.product_id), k.product_id, 'consumo',
                                        k.qty, 'estoque', 'Reposição padrão: suíte ' || v_suite);
      end if;
    end loop;
  end if;

  v_new := case when p_condition = 'problema' then 'problema' else 'concluida' end;
  update public.housekeeping_tasks
     set status = v_new, condition = p_condition, notes = coalesce(nullif(btrim(p_notes), ''), notes),
         finished_by = auth.uid(), finished_at = now(), finish_key = p_key,
         started_by = coalesce(started_by, auth.uid()), started_at = coalesce(started_at, now())
   where id = p_task;
  insert into public.audit_logs (motel_id, actor_id, action, details)
  values (p_motel, auth.uid(), 'limpeza_encerrada',
          jsonb_build_object('task', p_task, 'suite', t.suite_id, 'estado', p_condition, 'itens', coalesce(p_items, '[]'::jsonb)));
  return v_new;
end $$;

-- Resolver problema e liberar (dono e recepcao).
create or replace function public.housekeeping_resolve(p_motel uuid, p_task uuid, p_resolution text)
returns void language plpgsql security definer set search_path = public as $$
begin
  if not public.has_role(p_motel, array['dono','recepcao']) then raise exception 'Sem permissao'; end if;
  if length(btrim(coalesce(p_resolution, ''))) < 3 then perform public._stock_err('Descreva o que foi feito.'); end if;
  update public.housekeeping_tasks
     set status = 'concluida', resolved_by = auth.uid(), resolved_at = now(), resolution = btrim(p_resolution)
   where id = p_task and motel_id = p_motel and status = 'problema';
  if not found then perform public._stock_err('Esta suíte não está com problema em aberto.'); end if;
  insert into public.audit_logs (motel_id, actor_id, action, details)
  values (p_motel, auth.uid(), 'limpeza_problema_resolvido', jsonb_build_object('task', p_task));
end $$;

-- Cancelar uma limpeza aberta por engano (dono e recepcao).
create or replace function public.housekeeping_cancel(p_motel uuid, p_task uuid)
returns void language plpgsql security definer set search_path = public as $$
begin
  if not public.has_role(p_motel, array['dono','recepcao']) then raise exception 'Sem permissao'; end if;
  update public.housekeeping_tasks set status = 'cancelada', finished_by = auth.uid(), finished_at = now()
   where id = p_task and motel_id = p_motel and status in ('aguardando','em_limpeza');
  if not found then perform public._stock_err('Esta limpeza não está em aberto.'); end if;
  insert into public.audit_logs (motel_id, actor_id, action, details)
  values (p_motel, auth.uid(), 'limpeza_cancelada', jsonb_build_object('task', p_task));
end $$;


-- ---------- 7. FUNCOES DA CONTA DA HOSPEDAGEM ----------

-- Lancar consumo (dono e recepcao). Com produto: preco de venda e baixa no
-- estoque. Sem produto: descricao e preco informados (ex.: taxa, servico).
create or replace function public.reservation_charge_add(
  p_motel uuid, p_key uuid, p_reservation uuid, p_product uuid, p_qty numeric,
  p_description text default null, p_unit_price_cents integer default null)
returns uuid language plpgsql security definer set search_path = public as $$
declare
  v_status text;
  v_p public.products%rowtype;
  v_id uuid;
  v_mov uuid;
  v_price integer;
  v_desc text;
begin
  if not public.has_role(p_motel, array['dono','recepcao']) then raise exception 'Sem permissao'; end if;
  if p_key is null then perform public._stock_err('Pedido sem identificação. Recarregue a página.'); end if;
  select id into v_id from public.reservation_charges where motel_id = p_motel and client_key = p_key;
  if v_id is not null then return v_id; end if;   -- pedido repetido

  select status into v_status from public.reservations where id = p_reservation and motel_id = p_motel for update;
  if v_status is null then perform public._stock_err('Reserva não encontrada.'); end if;
  if v_status not in ('chegou','concluida') then
    perform public._stock_err('Só dá para lançar consumo em reserva em andamento ou concluída.');
  end if;
  if p_qty is null or p_qty <= 0 or p_qty > 1000 then perform public._stock_err('Quantidade inválida.'); end if;

  if p_product is not null then
    select * into v_p from public.products where id = p_product and motel_id = p_motel;
    if not found or not v_p.active or v_p.kind <> 'consumo' then perform public._stock_err('Produto inválido.'); end if;
    v_price := coalesce(p_unit_price_cents, v_p.sale_price_cents);
    if v_price is null then perform public._stock_err('Este produto não tem preço de venda. Informe o preço.'); end if;
    v_desc := v_p.name;
    v_mov := public._stock_exit_core(p_motel, public._derived_key(p_key, 'mov'), v_p.id, 'consumo', p_qty, 'estoque',
                                     'Consumo lançado na conta');
  else
    v_desc := btrim(coalesce(p_description, ''));
    if length(v_desc) < 2 then perform public._stock_err('Descreva o item.'); end if;
    v_price := p_unit_price_cents;
    if v_price is null then perform public._stock_err('Informe o preço.'); end if;
  end if;
  if v_price < 0 then perform public._stock_err('Preço inválido.'); end if;

  insert into public.reservation_charges
    (motel_id, reservation_id, product_id, description, qty, unit_price_cents, total_cents, source,
     stock_movement_id, created_by, client_key)
  values
    (p_motel, p_reservation, p_product, left(v_desc, 120), p_qty, v_price, round(p_qty * v_price), 'recepcao',
     v_mov, auth.uid(), p_key)
  returning id into v_id;
  insert into public.audit_logs (motel_id, actor_id, action, details)
  values (p_motel, auth.uid(), 'conta_lancamento',
          jsonb_build_object('charge', v_id, 'reservation', p_reservation, 'total', round(p_qty * v_price)));
  return v_id;
end $$;

-- Estornar um lancamento da conta (so dono). Devolve o item ao estoque.
create or replace function public.reservation_charge_reverse(p_motel uuid, p_key uuid, p_charge uuid, p_reason text)
returns uuid language plpgsql security definer set search_path = public as $$
declare
  c public.reservation_charges%rowtype;
  v_id uuid;
  v_mov uuid;
begin
  if not public.has_role(p_motel, array['dono']) then raise exception 'Sem permissao'; end if;
  if p_key is null then perform public._stock_err('Pedido sem identificação. Recarregue a página.'); end if;
  if length(btrim(coalesce(p_reason, ''))) < 3 then perform public._stock_err('Informe o motivo do estorno.'); end if;
  select id into v_id from public.reservation_charges where motel_id = p_motel and client_key = p_key;
  if v_id is not null then return v_id; end if;

  select * into c from public.reservation_charges where id = p_charge and motel_id = p_motel for update;
  if not found then perform public._stock_err('Lançamento não encontrado.'); end if;
  if c.source = 'estorno' then perform public._stock_err('Um estorno não pode ser estornado.'); end if;
  if exists (select 1 from public.reservation_charges where reverses_id = p_charge) then
    perform public._stock_err('Este lançamento já foi estornado.');
  end if;

  if c.stock_movement_id is not null
     and not exists (select 1 from public.stock_movements where reverses_id = c.stock_movement_id) then
    v_mov := public.stock_reverse(p_motel, public._derived_key(p_key, 'mov'), c.stock_movement_id,
                                  'Estorno na conta: ' || btrim(p_reason));
  end if;
  insert into public.reservation_charges
    (motel_id, reservation_id, product_id, description, qty, unit_price_cents, total_cents, source,
     stock_movement_id, reverses_id, created_by, client_key)
  values
    (p_motel, c.reservation_id, c.product_id, left('Estorno: ' || c.description, 120), c.qty, c.unit_price_cents,
     -c.total_cents, 'estorno', v_mov, p_charge, auth.uid(), p_key)
  returning id into v_id;
  insert into public.audit_logs (motel_id, actor_id, action, details)
  values (p_motel, auth.uid(), 'conta_estorno', jsonb_build_object('charge', v_id, 'reverses', p_charge, 'motivo', btrim(p_reason)));
  return v_id;
end $$;

revoke all on function public.housekeeping_request(uuid, uuid, text) from public, anon;
revoke all on function public.housekeeping_start(uuid, uuid) from public, anon;
revoke all on function public.housekeeping_finish(uuid, uuid, uuid, text, text, boolean, jsonb) from public, anon;
revoke all on function public.housekeeping_resolve(uuid, uuid, text) from public, anon;
revoke all on function public.housekeeping_cancel(uuid, uuid) from public, anon;
revoke all on function public.reservation_charge_add(uuid, uuid, uuid, uuid, numeric, text, integer) from public, anon;
revoke all on function public.reservation_charge_reverse(uuid, uuid, uuid, text) from public, anon;
grant execute on function public.housekeeping_request(uuid, uuid, text) to authenticated;
grant execute on function public.housekeeping_start(uuid, uuid) to authenticated;
grant execute on function public.housekeeping_finish(uuid, uuid, uuid, text, text, boolean, jsonb) to authenticated;
grant execute on function public.housekeeping_resolve(uuid, uuid, text) to authenticated;
grant execute on function public.housekeeping_cancel(uuid, uuid) to authenticated;
grant execute on function public.reservation_charge_add(uuid, uuid, uuid, uuid, numeric, text, integer) to authenticated;
grant execute on function public.reservation_charge_reverse(uuid, uuid, uuid, text) to authenticated;


-- ---------- 8. SEGURANCA POR LINHA (RLS) ----------

alter table public.suite_categories     enable row level security;
alter table public.suite_category_kits  enable row level security;
alter table public.housekeeping_tasks   enable row level security;
alter table public.reservation_charges  enable row level security;

create policy suite_categories_select on public.suite_categories for select to authenticated
  using (public.is_member(motel_id));
create policy suite_categories_write on public.suite_categories for all to authenticated
  using (public.has_role(motel_id, array['dono'])) with check (public.has_role(motel_id, array['dono']));
create policy suite_category_kits_select on public.suite_category_kits for select to authenticated
  using (public.is_member(motel_id));
create policy suite_category_kits_write on public.suite_category_kits for all to authenticated
  using (public.has_role(motel_id, array['dono'])) with check (public.has_role(motel_id, array['dono']));
-- limpeza: toda a equipe ve (so suite e horario; nada de hospede). Grava so pelas funcoes.
create policy housekeeping_select on public.housekeeping_tasks for select to authenticated
  using (public.is_member(motel_id));
-- conta: dono e recepcao (mesma regra das reservas). Grava so pelas funcoes.
create policy reservation_charges_select on public.reservation_charges for select to authenticated
  using (public.has_role(motel_id, array['dono','recepcao']));

revoke all on public.suite_categories, public.suite_category_kits, public.housekeeping_tasks,
              public.reservation_charges from anon, authenticated;
grant select, insert, update, delete on public.suite_categories    to authenticated;
grant select, insert, update, delete on public.suite_category_kits to authenticated;
grant select on public.housekeeping_tasks, public.reservation_charges to authenticated;
-- a coluna nova de suites ja segue as regras de suites (so o dono altera)


-- =====================================================================
-- COMO DESFAZER (apaga limpezas, kits, categorias de suite e a conta da
-- hospedagem; as suites e o "type" continuam como estavam):
--
-- drop trigger if exists trg_reservation_checkout_task on public.reservations;
-- drop function if exists public._reservation_checkout_task(),
--   public.reservation_charge_reverse(uuid, uuid, uuid, text),
--   public.reservation_charge_add(uuid, uuid, uuid, uuid, numeric, text, integer),
--   public.housekeeping_cancel(uuid, uuid), public.housekeeping_resolve(uuid, uuid, text),
--   public.housekeeping_finish(uuid, uuid, uuid, text, text, boolean, jsonb),
--   public.housekeeping_start(uuid, uuid), public.housekeeping_request(uuid, uuid, text),
--   public._stock_transfer_core(uuid, uuid, uuid, numeric, text, text, text),
--   public._stock_exit_core(uuid, uuid, uuid, text, numeric, text, text), public._derived_key(uuid, text);
-- drop table if exists public.reservation_charges, public.housekeeping_tasks, public.suite_category_kits;
-- alter table public.suites drop constraint if exists suites_category_fk;
-- alter table public.suites drop column if exists category_id;
-- drop table if exists public.suite_categories;
-- =====================================================================
