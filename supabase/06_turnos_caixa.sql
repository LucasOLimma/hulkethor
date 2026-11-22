-- =====================================================================
-- ETAPA 6 | Central de Turnos e caixa da recepcao (Fase 1C)
--
-- PRE-REQUISITO: 01 a 05 ja executados.
--
-- O QUE FAZ (so ACRESCENTA; nao altera nem apaga dados existentes):
--   * Lista de conferencia da abertura de turno, editavel pelo dono (cria os
--     8 itens padrao em cada motel).
--   * Turnos: UM turno aberto por motel. Abertura com a lista conferida e o
--     fundo de caixa contado; fechamento com o dinheiro contado, o valor
--     esperado, a diferenca e a passagem de plantao.
--   * Pagamentos das reservas (dinheiro, Pix, cartao), sempre ligados ao
--     turno aberto. Pode dividir (ex.: parte Pix, parte dinheiro).
--   * REGRA NO BANCO: a reserva so vai para "concluida" (saida) com a conta
--     paga (hospedagem + consumos - pagamentos = 0). Consumo informado
--     depois da saida (camareira) vira saldo a receber.
--   * Sangria e suprimento do caixa, com motivo.
--   * Nada e apagado: correcao de pagamento e estorno (so o dono).
--   * A recepcao ve o turno aberto e os proprios turnos; o historico de
--     todos os turnos (e as diferencas) e so do dono.
--
-- Rode o arquivo inteiro de uma vez. O fim mostra como desfazer.
-- =====================================================================


-- ---------- 1. LISTA DE CONFERENCIA ----------

create table public.shift_checklist_items (
  id          uuid primary key default gen_random_uuid(),
  motel_id    uuid not null references public.motels(id) on delete cascade,
  label       text not null check (length(btrim(label)) between 3 and 120),
  position    integer not null default 0,
  active      boolean not null default true,
  created_at  timestamptz not null default now()
);
create index on public.shift_checklist_items (motel_id, position);

create or replace function public._shift_default_checklist(p_motel uuid)
returns void language sql security definer set search_path = public as $$
  insert into public.shift_checklist_items (motel_id, label, position)
  select p_motel, l, n from unnest(array[
    'Recebi o plantão da recepcionista anterior',
    'Conferi as pendências e ocorrências',
    'Conferi o fundo de caixa',
    'Verifiquei as suítes e seus status',
    'Conferi as reservas e saídas previstas',
    'Verifiquei o sistema e os equipamentos',
    'Conferi telefone e canais de atendimento',
    'Registrei observações importantes'
  ]) with ordinality as t(l, n)
  where not exists (select 1 from public.shift_checklist_items where motel_id = p_motel);
$$;
revoke all on function public._shift_default_checklist(uuid) from public, anon, authenticated;

create or replace function public._motels_default_checklist()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  perform public._shift_default_checklist(new.id);
  return new;
end $$;
revoke all on function public._motels_default_checklist() from public, anon, authenticated;
create trigger trg_motels_default_checklist after insert on public.motels
  for each row execute function public._motels_default_checklist();

select public._shift_default_checklist(id) from public.motels;


-- ---------- 2. TURNOS, PAGAMENTOS E CAIXA ----------

create table public.shifts (
  id                    uuid primary key default gen_random_uuid(),
  motel_id              uuid not null references public.motels(id) on delete cascade,
  status                text not null default 'aberto' check (status in ('aberto','fechado')),
  opened_by             uuid not null,
  opened_at             timestamptz not null default now(),
  opening_float_cents   integer not null check (opening_float_cents >= 0),
  checklist             jsonb not null default '[]'::jsonb,   -- o que foi conferido na abertura
  opening_notes         text check (opening_notes is null or length(opening_notes) <= 2000),
  closed_by             uuid,
  closed_at             timestamptz,
  counted_cash_cents    integer check (counted_cash_cents >= 0),
  expected_cash_cents   integer,
  difference_cents      integer,
  handover_notes        text check (handover_notes is null or length(handover_notes) <= 2000),
  unique (motel_id, id)
);
-- um turno aberto por motel
create unique index shifts_um_aberto on public.shifts (motel_id) where status = 'aberto';
create index on public.shifts (motel_id, opened_at desc);

create table public.payments (
  id              uuid primary key default gen_random_uuid(),
  motel_id        uuid not null references public.motels(id) on delete cascade,
  reservation_id  uuid not null references public.reservations(id) on delete cascade,
  shift_id        uuid references public.shifts(id),
  method          text not null check (method in ('dinheiro','pix','credito','debito')),
  amount_cents    integer not null check (amount_cents <> 0),   -- negativo no estorno
  reverses_id     uuid references public.payments(id),
  reason          text check (reason is null or length(reason) <= 300),
  created_by      uuid,
  created_at      timestamptz not null default now(),
  client_key      uuid not null,
  unique (motel_id, client_key)
);
create index on public.payments (reservation_id);
create index on public.payments (shift_id);
create unique index payments_um_estorno on public.payments (reverses_id) where reverses_id is not null;

create table public.cash_movements (
  id            uuid primary key default gen_random_uuid(),
  motel_id      uuid not null references public.motels(id) on delete cascade,
  shift_id      uuid not null references public.shifts(id) on delete cascade,
  type          text not null check (type in ('sangria','suprimento')),
  amount_cents  integer not null check (amount_cents > 0),
  reason        text not null check (length(btrim(reason)) between 3 and 300),
  created_by    uuid,
  created_at    timestamptz not null default now(),
  client_key    uuid not null,
  unique (motel_id, client_key)
);
create index on public.cash_movements (shift_id);


-- ---------- 3. FUNCOES AUXILIARES ----------

-- 12345 -> 'R$ 123,45' (para as mensagens)
create or replace function public._brl(p_cents integer)
returns text language sql immutable as $$
  select 'R$ ' || replace(to_char(p_cents / 100.0, 'FM9999999990.00'), '.', ',');
$$;
revoke all on function public._brl(integer) from public, anon, authenticated;

-- Quanto falta pagar: hospedagem + consumos - pagamentos.
create or replace function public._reservation_due(p_reservation uuid)
returns integer language sql stable security definer set search_path = public as $$
  select r.total_cents
       + coalesce((select sum(total_cents) from public.reservation_charges where reservation_id = r.id), 0)::int
       - coalesce((select sum(amount_cents) from public.payments where reservation_id = r.id), 0)::int
    from public.reservations r where r.id = p_reservation;
$$;
revoke all on function public._reservation_due(uuid) from public, anon, authenticated;

create or replace function public._open_shift(p_motel uuid)
returns uuid language sql stable security definer set search_path = public as $$
  select id from public.shifts where motel_id = p_motel and status = 'aberto';
$$;
revoke all on function public._open_shift(uuid) from public, anon, authenticated;

-- Grava os pagamentos de uma reserva (partes: [{"method":"pix","amount_cents":5000}, ...]).
create or replace function public._payments_insert(p_motel uuid, p_key uuid, p_reservation uuid, p_shift uuid, p_parts jsonb)
returns integer language plpgsql security definer set search_path = public as $$
declare
  it jsonb;
  v_method text;
  v_amount integer;
  v_sum integer := 0;
  v_i integer := 0;
begin
  if jsonb_typeof(coalesce(p_parts, '[]'::jsonb)) <> 'array' or jsonb_array_length(p_parts) > 6 then
    perform public._stock_err('Formas de pagamento inválidas.');
  end if;
  for it in select * from jsonb_array_elements(p_parts) loop
    v_i := v_i + 1;
    v_method := it->>'method';
    begin
      v_amount := (it->>'amount_cents')::integer;
    exception when others then
      perform public._stock_err('Valor de pagamento inválido.');
    end;
    if v_method not in ('dinheiro','pix','credito','debito') then perform public._stock_err('Forma de pagamento inválida.'); end if;
    if v_amount is null or v_amount <= 0 then perform public._stock_err('Valor de pagamento inválido.'); end if;
    insert into public.payments (motel_id, reservation_id, shift_id, method, amount_cents, created_by, client_key)
    values (p_motel, p_reservation, p_shift, v_method, v_amount, auth.uid(), public._derived_key(p_key, 'p' || v_i));
    v_sum := v_sum + v_amount;
  end loop;
  return v_sum;
end $$;
revoke all on function public._payments_insert(uuid, uuid, uuid, uuid, jsonb) from public, anon, authenticated;


-- ---------- 4. REGRA: SAIDA SO COM A CONTA PAGA ----------

create or replace function public._reservation_paid_guard()
returns trigger language plpgsql security definer set search_path = public as $$
declare v_due integer;
begin
  if new.status = 'concluida' and old.status is distinct from 'concluida' then
    v_due := public._reservation_due(new.id);
    if v_due > 0 then
      raise exception using message = 'Registre o pagamento antes da saída (falta ' ||
        public._brl(v_due) || ').', errcode = 'P0001', hint = 'estoque';
    end if;
  end if;
  return new;
end $$;
revoke all on function public._reservation_paid_guard() from public, anon, authenticated;
create trigger trg_reservation_paid_guard before update of status on public.reservations
  for each row execute function public._reservation_paid_guard();


-- ---------- 5. FUNCOES DO TURNO ----------

-- Abrir (dono e recepcao): todos os itens ativos da lista conferidos + fundo contado.
create or replace function public.shift_open(p_motel uuid, p_float_cents integer, p_checked uuid[], p_notes text default null)
returns uuid language plpgsql security definer set search_path = public as $$
declare
  v_id uuid;
  v_list jsonb;
begin
  if not public.has_role(p_motel, array['dono','recepcao']) then raise exception 'Sem permissao'; end if;
  if p_float_cents is null or p_float_cents < 0 then perform public._stock_err('Informe o fundo de caixa contado (pode ser 0,00).'); end if;
  if exists (select 1 from public.shift_checklist_items i
              where i.motel_id = p_motel and i.active and not (i.id = any(coalesce(p_checked, '{}')))) then
    perform public._stock_err('Confira todos os itens da lista antes de abrir o turno.');
  end if;
  if public._open_shift(p_motel) is not null then
    perform public._stock_err('Já existe um turno aberto. Ele precisa ser fechado antes.');
  end if;
  select coalesce(jsonb_agg(label order by position, created_at), '[]'::jsonb) into v_list
    from public.shift_checklist_items where motel_id = p_motel and active;
  insert into public.shifts (motel_id, opened_by, opening_float_cents, checklist, opening_notes)
  values (p_motel, auth.uid(), p_float_cents, v_list, nullif(btrim(p_notes), ''))
  returning id into v_id;
  insert into public.audit_logs (motel_id, actor_id, action, details)
  values (p_motel, auth.uid(), 'turno_aberto', jsonb_build_object('shift', v_id, 'fundo', p_float_cents));
  return v_id;
exception when unique_violation then
  perform public._stock_err('Já existe um turno aberto. Ele precisa ser fechado antes.');
  return null;
end $$;

-- Resumo do caixa do turno (dono: qualquer turno; recepcao: turno aberto ou os proprios).
create or replace function public.shift_summary(p_motel uuid, p_shift uuid)
returns json language plpgsql stable security definer set search_path = public as $$
declare s public.shifts%rowtype;
begin
  select * into s from public.shifts where id = p_shift and motel_id = p_motel;
  if not found then raise exception 'Sem permissao'; end if;
  if not (public.has_role(p_motel, array['dono'])
          or (public.has_role(p_motel, array['recepcao']) and (s.status = 'aberto' or s.opened_by = auth.uid()))) then
    raise exception 'Sem permissao';
  end if;
  return (
    select json_build_object(
      'float', s.opening_float_cents,
      'dinheiro', coalesce(sum(p.amount_cents) filter (where p.method = 'dinheiro'), 0),
      'pix', coalesce(sum(p.amount_cents) filter (where p.method = 'pix'), 0),
      'credito', coalesce(sum(p.amount_cents) filter (where p.method = 'credito'), 0),
      'debito', coalesce(sum(p.amount_cents) filter (where p.method = 'debito'), 0),
      'suprimentos', (select coalesce(sum(amount_cents), 0) from public.cash_movements where shift_id = s.id and type = 'suprimento'),
      'sangrias', (select coalesce(sum(amount_cents), 0) from public.cash_movements where shift_id = s.id and type = 'sangria'),
      'expected', s.opening_float_cents
                  + coalesce(sum(p.amount_cents) filter (where p.method = 'dinheiro'), 0)
                  + (select coalesce(sum(amount_cents), 0) from public.cash_movements where shift_id = s.id and type = 'suprimento')
                  - (select coalesce(sum(amount_cents), 0) from public.cash_movements where shift_id = s.id and type = 'sangria')
    )
    from public.payments p where p.shift_id = s.id
  );
end $$;

-- Fechar (quem abriu, ou o dono): dinheiro contado x esperado. Devolve a diferenca.
create or replace function public.shift_close(p_motel uuid, p_shift uuid, p_counted_cents integer, p_handover text default null)
returns integer language plpgsql security definer set search_path = public as $$
declare
  s public.shifts%rowtype;
  v_expected integer;
begin
  if not public.has_role(p_motel, array['dono','recepcao']) then raise exception 'Sem permissao'; end if;
  select * into s from public.shifts where id = p_shift and motel_id = p_motel for update;
  if not found or s.status <> 'aberto' then perform public._stock_err('Este turno não está aberto.'); end if;
  if s.opened_by <> auth.uid() and not public.has_role(p_motel, array['dono']) then
    perform public._stock_err('Só quem abriu o turno (ou o proprietário) pode fechá-lo.');
  end if;
  if p_counted_cents is null or p_counted_cents < 0 then perform public._stock_err('Informe o dinheiro contado no caixa.'); end if;
  v_expected := (public.shift_summary(p_motel, p_shift)->>'expected')::integer;
  update public.shifts
     set status = 'fechado', closed_by = auth.uid(), closed_at = now(), counted_cash_cents = p_counted_cents,
         expected_cash_cents = v_expected, difference_cents = p_counted_cents - v_expected,
         handover_notes = nullif(btrim(p_handover), '')
   where id = p_shift;
  insert into public.audit_logs (motel_id, actor_id, action, details)
  values (p_motel, auth.uid(), 'turno_fechado',
          jsonb_build_object('shift', p_shift, 'esperado', v_expected, 'contado', p_counted_cents, 'diferenca', p_counted_cents - v_expected));
  return p_counted_cents - v_expected;
end $$;

-- Ultima passagem de plantao (para quem vai abrir o proximo turno).
create or replace function public.shift_last_handover(p_motel uuid)
returns json language sql stable security definer set search_path = public as $$
  select case when public.has_role(p_motel, array['dono','recepcao']) then (
    select json_build_object('notes', handover_notes, 'closed_at', closed_at)
      from public.shifts where motel_id = p_motel and status = 'fechado'
     order by closed_at desc limit 1)
  end;
$$;

-- Sangria / suprimento (dono e recepcao), no turno aberto.
create or replace function public.cash_movement_add(p_motel uuid, p_key uuid, p_type text, p_amount_cents integer, p_reason text)
returns uuid language plpgsql security definer set search_path = public as $$
declare v_shift uuid; v_id uuid;
begin
  if not public.has_role(p_motel, array['dono','recepcao']) then raise exception 'Sem permissao'; end if;
  if p_key is null then perform public._stock_err('Pedido sem identificação. Recarregue a página.'); end if;
  if p_type not in ('sangria','suprimento') then perform public._stock_err('Tipo inválido.'); end if;
  if p_amount_cents is null or p_amount_cents <= 0 then perform public._stock_err('Informe o valor.'); end if;
  if length(btrim(coalesce(p_reason, ''))) < 3 then perform public._stock_err('Informe o motivo.'); end if;
  v_shift := public._open_shift(p_motel);
  if v_shift is null then perform public._stock_err('Abra o turno antes de mexer no caixa.'); end if;
  insert into public.cash_movements (motel_id, shift_id, type, amount_cents, reason, created_by, client_key)
  values (p_motel, v_shift, p_type, p_amount_cents, btrim(p_reason), auth.uid(), p_key)
  on conflict (motel_id, client_key) do nothing
  returning id into v_id;
  if v_id is null then
    select id into v_id from public.cash_movements where motel_id = p_motel and client_key = p_key;
    return v_id;
  end if;
  insert into public.audit_logs (motel_id, actor_id, action, details)
  values (p_motel, auth.uid(), 'caixa_' || p_type, jsonb_build_object('id', v_id, 'valor', p_amount_cents));
  return v_id;
end $$;


-- ---------- 6. PAGAMENTO E SAIDA ----------

-- Saida com pagamento (dono e recepcao), numa transacao: grava os pagamentos
-- no turno aberto e conclui a reserva (o que cria a limpeza, regra do 05).
-- A soma das partes precisa ser exatamente o que falta pagar.
create or replace function public.reservation_checkout(p_motel uuid, p_key uuid, p_reservation uuid, p_parts jsonb)
returns void language plpgsql security definer set search_path = public as $$
declare
  v_status text;
  v_shift uuid;
  v_due integer;
  v_sum integer := 0;
begin
  if not public.has_role(p_motel, array['dono','recepcao']) then raise exception 'Sem permissao'; end if;
  if p_key is null then perform public._stock_err('Pedido sem identificação. Recarregue a página.'); end if;
  select status into v_status from public.reservations where id = p_reservation and motel_id = p_motel for update;
  if v_status is null then perform public._stock_err('Reserva não encontrada.'); end if;
  if v_status = 'concluida' then return; end if;   -- ja saiu (pedido repetido)
  if v_status <> 'chegou' then perform public._stock_err('Só dá para registrar a saída de reserva em andamento.'); end if;
  v_shift := public._open_shift(p_motel);
  if v_shift is null then perform public._stock_err('Abra o turno na Central de Turnos antes de registrar a saída.'); end if;
  v_due := public._reservation_due(p_reservation);
  if v_due > 0 then
    v_sum := public._payments_insert(p_motel, p_key, p_reservation, v_shift, coalesce(p_parts, '[]'::jsonb));
    if v_sum <> v_due then
      perform public._stock_err('A soma dos pagamentos (' || public._brl(v_sum) ||
        ') precisa ser igual ao total a pagar (' || public._brl(v_due) || ').');
    end if;
  end if;
  update public.reservations set status = 'concluida' where id = p_reservation;
  insert into public.audit_logs (motel_id, actor_id, action, details)
  values (p_motel, auth.uid(), 'reserva_saida_paga', jsonb_build_object('reservation', p_reservation, 'pago', v_sum, 'turno', v_shift));
end $$;

-- Receber saldo depois da saida (ex.: consumo informado pela camareira).
create or replace function public.payment_register(p_motel uuid, p_key uuid, p_reservation uuid, p_parts jsonb)
returns integer language plpgsql security definer set search_path = public as $$
declare
  v_status text;
  v_shift uuid;
  v_due integer;
  v_sum integer;
begin
  if not public.has_role(p_motel, array['dono','recepcao']) then raise exception 'Sem permissao'; end if;
  if p_key is null then perform public._stock_err('Pedido sem identificação. Recarregue a página.'); end if;
  if exists (select 1 from public.payments where motel_id = p_motel and client_key = public._derived_key(p_key, 'p1')) then
    return 0;   -- pedido repetido
  end if;
  select status into v_status from public.reservations where id = p_reservation and motel_id = p_motel for update;
  if v_status is null then perform public._stock_err('Reserva não encontrada.'); end if;
  if v_status not in ('chegou','concluida') then perform public._stock_err('Só dá para receber de reserva em andamento ou concluída.'); end if;
  v_shift := public._open_shift(p_motel);
  if v_shift is null then perform public._stock_err('Abra o turno na Central de Turnos antes de receber.'); end if;
  v_due := public._reservation_due(p_reservation);
  if v_due <= 0 then perform public._stock_err('Esta conta já está paga.'); end if;
  v_sum := public._payments_insert(p_motel, p_key, p_reservation, v_shift, coalesce(p_parts, '[]'::jsonb));
  if v_sum > v_due then
    perform public._stock_err('O valor recebido é maior que o saldo (' || public._brl(v_due) || ').');
  end if;
  insert into public.audit_logs (motel_id, actor_id, action, details)
  values (p_motel, auth.uid(), 'pagamento_recebido', jsonb_build_object('reservation', p_reservation, 'valor', v_sum, 'turno', v_shift));
  return v_sum;
end $$;

-- Estornar um pagamento (so dono). O estorno entra no turno aberto (se houver).
create or replace function public.payment_reverse(p_motel uuid, p_key uuid, p_payment uuid, p_reason text)
returns uuid language plpgsql security definer set search_path = public as $$
declare
  p public.payments%rowtype;
  v_id uuid;
begin
  if not public.has_role(p_motel, array['dono']) then raise exception 'Sem permissao'; end if;
  if p_key is null then perform public._stock_err('Pedido sem identificação. Recarregue a página.'); end if;
  if length(btrim(coalesce(p_reason, ''))) < 3 then perform public._stock_err('Informe o motivo do estorno.'); end if;
  select id into v_id from public.payments where motel_id = p_motel and client_key = p_key;
  if v_id is not null then return v_id; end if;
  select * into p from public.payments where id = p_payment and motel_id = p_motel for update;
  if not found then perform public._stock_err('Pagamento não encontrado.'); end if;
  if p.amount_cents < 0 then perform public._stock_err('Um estorno não pode ser estornado.'); end if;
  if exists (select 1 from public.payments where reverses_id = p_payment) then
    perform public._stock_err('Este pagamento já foi estornado.');
  end if;
  insert into public.payments (motel_id, reservation_id, shift_id, method, amount_cents, reverses_id, reason, created_by, client_key)
  values (p_motel, p.reservation_id, public._open_shift(p_motel), p.method, -p.amount_cents, p_payment, btrim(p_reason), auth.uid(), p_key)
  returning id into v_id;
  insert into public.audit_logs (motel_id, actor_id, action, details)
  values (p_motel, auth.uid(), 'pagamento_estornado', jsonb_build_object('payment', v_id, 'reverses', p_payment, 'motivo', btrim(p_reason)));
  return v_id;
end $$;

revoke all on function public.shift_open(uuid, integer, uuid[], text) from public, anon;
revoke all on function public.shift_summary(uuid, uuid) from public, anon;
revoke all on function public.shift_close(uuid, uuid, integer, text) from public, anon;
revoke all on function public.shift_last_handover(uuid) from public, anon;
revoke all on function public.cash_movement_add(uuid, uuid, text, integer, text) from public, anon;
revoke all on function public.reservation_checkout(uuid, uuid, uuid, jsonb) from public, anon;
revoke all on function public.payment_register(uuid, uuid, uuid, jsonb) from public, anon;
revoke all on function public.payment_reverse(uuid, uuid, uuid, text) from public, anon;
grant execute on function public.shift_open(uuid, integer, uuid[], text) to authenticated;
grant execute on function public.shift_summary(uuid, uuid) to authenticated;
grant execute on function public.shift_close(uuid, uuid, integer, text) to authenticated;
grant execute on function public.shift_last_handover(uuid) to authenticated;
grant execute on function public.cash_movement_add(uuid, uuid, text, integer, text) to authenticated;
grant execute on function public.reservation_checkout(uuid, uuid, uuid, jsonb) to authenticated;
grant execute on function public.payment_register(uuid, uuid, uuid, jsonb) to authenticated;
grant execute on function public.payment_reverse(uuid, uuid, uuid, text) to authenticated;


-- ---------- 7. SEGURANCA POR LINHA (RLS) ----------

alter table public.shift_checklist_items enable row level security;
alter table public.shifts                enable row level security;
alter table public.payments              enable row level security;
alter table public.cash_movements        enable row level security;

create policy checklist_select on public.shift_checklist_items for select to authenticated
  using (public.has_role(motel_id, array['dono','recepcao']));
create policy checklist_write on public.shift_checklist_items for all to authenticated
  using (public.has_role(motel_id, array['dono'])) with check (public.has_role(motel_id, array['dono']));
-- turnos: dono ve todos; recepcao ve o turno aberto e os que ela abriu
create policy shifts_select on public.shifts for select to authenticated
  using (public.has_role(motel_id, array['dono'])
         or (public.has_role(motel_id, array['recepcao']) and (status = 'aberto' or opened_by = auth.uid())));
-- pagamentos: dono e recepcao (mesma regra das reservas)
create policy payments_select on public.payments for select to authenticated
  using (public.has_role(motel_id, array['dono','recepcao']));
-- movimentos do caixa: mesma regra dos turnos
create policy cash_movements_select on public.cash_movements for select to authenticated
  using (public.has_role(motel_id, array['dono'])
         or (public.has_role(motel_id, array['recepcao'])
             and exists (select 1 from public.shifts s where s.id = shift_id
                          and (s.status = 'aberto' or s.opened_by = auth.uid()))));

revoke all on public.shift_checklist_items, public.shifts, public.payments, public.cash_movements from anon, authenticated;
grant select, insert, update, delete on public.shift_checklist_items to authenticated;
grant select on public.shifts, public.payments, public.cash_movements to authenticated;


-- =====================================================================
-- COMO DESFAZER (apaga turnos, pagamentos, caixa e a lista de conferencia):
--
-- drop trigger if exists trg_reservation_paid_guard on public.reservations;
-- drop trigger if exists trg_motels_default_checklist on public.motels;
-- drop function if exists public.payment_reverse(uuid, uuid, uuid, text),
--   public.payment_register(uuid, uuid, uuid, jsonb), public.reservation_checkout(uuid, uuid, uuid, jsonb),
--   public.cash_movement_add(uuid, uuid, text, integer, text), public.shift_last_handover(uuid),
--   public.shift_close(uuid, uuid, integer, text), public.shift_summary(uuid, uuid),
--   public.shift_open(uuid, integer, uuid[], text), public._reservation_paid_guard(),
--   public._payments_insert(uuid, uuid, uuid, uuid, jsonb), public._open_shift(uuid),
--   public._reservation_due(uuid), public._brl(integer), public._motels_default_checklist(), public._shift_default_checklist(uuid);
-- drop table if exists public.cash_movements, public.payments, public.shifts, public.shift_checklist_items;
-- =====================================================================
