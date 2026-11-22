-- =====================================================================
-- ETAPA 3 | Pagina publica do motel + pedidos de reserva de clientes
--
-- PRE-REQUISITO: 02_reservas_sem_conflito.sql ja executado.
--
-- O QUE FAZ:
--   1) Acrescenta a situacao "pendente" (pedido do cliente aguardando a
--      recepcao). Pendente NAO bloqueia a suite; so "confirmada" e
--      "chegou" bloqueiam (regra do 02).
--   2) Funcao de LEITURA publica: dados do motel e suites ATIVAS (sem
--      nenhum dado de hospede ou interno).
--   3) Funcao de PEDIDO publico: valida tudo no banco e grava como
--      "pendente". O PRECO vem da tabela da suite (o cliente nao escolhe).
--
-- Visitantes sem login (anon) continuam SEM acesso direto a nenhuma tabela:
-- so conseguem chamar estas duas funcoes.
--
-- NAO APAGA NEM ALTERA DADOS EXISTENTES. Rode um passo por vez.
-- =====================================================================


-- ---------- PASSO 1: nova situacao "pendente" ----------
alter table public.reservations drop constraint if exists reservations_status_check;
alter table public.reservations add constraint reservations_status_check
  check (status in ('pendente', 'confirmada', 'cancelada', 'chegou', 'concluida', 'nao_compareceu'));


-- ---------- PASSO 2: leitura publica do motel e das suites ativas ----------
create or replace function public.public_motel_page(p_slug text)
returns json
language sql
stable
security definer
set search_path = public
as $$
  select json_build_object(
    'name', m.name,
    'slug', m.slug,
    'address', m.address,
    'timezone', m.timezone,
    'suites', coalesce((
      select json_agg(json_build_object(
               'id', s.id,
               'number', s.number,
               'type', s.type,
               'prices_cents', s.prices_cents,
               'items', s.items
             ) order by length(s.number), s.number)
      from public.suites s
      where s.motel_id = m.id and s.active
    ), '[]'::json)
  )
  from public.motels m
  where m.slug = lower(p_slug);
$$;

revoke all on function public.public_motel_page(text) from public;
grant execute on function public.public_motel_page(text) to anon, authenticated;


-- ---------- PASSO 3: pedido de reserva pelo cliente ----------
create or replace function public.public_request_reservation(
  p_slug text,
  p_suite uuid,
  p_date date,
  p_time time,
  p_period text,
  p_guest text,
  p_adult boolean,
  p_terms text
)
returns text
language plpgsql
volatile
security definer
set search_path = public
as $$
declare
  v_motel public.motels%rowtype;
  v_suite public.suites%rowtype;
  v_today date;
  v_price int;
  v_range tsrange;
  v_code text;
  v_alphabet constant text := 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  i int;
begin
  select * into v_motel from public.motels where slug = lower(p_slug);
  if not found then raise exception 'Estabelecimento nao encontrado' using errcode = 'P0001'; end if;

  select * into v_suite from public.suites where id = p_suite and motel_id = v_motel.id and active;
  if not found then raise exception 'Suite indisponivel' using errcode = 'P0001'; end if;

  if p_adult is distinct from true then
    raise exception 'Confirme a maioridade' using errcode = 'P0001';
  end if;
  if coalesce(length(trim(p_terms)), 0) = 0 then
    raise exception 'Aceite os termos' using errcode = 'P0001';
  end if;
  if p_period not in ('3h', '6h', '12h', 'pernoite') or p_time is null or p_date is null then
    raise exception 'Dados invalidos' using errcode = 'P0001';
  end if;

  v_today := (now() at time zone v_motel.timezone)::date;
  if p_date < v_today or p_date > v_today + 60 then
    raise exception 'Data fora do periodo permitido' using errcode = 'P0001';
  end if;
  if p_date = v_today and p_time < (now() at time zone v_motel.timezone)::time then
    raise exception 'Horario ja passou' using errcode = 'P0001';
  end if;

  -- preco SEMPRE da tabela da suite
  v_price := (v_suite.prices_cents ->> p_period)::int;
  if v_price is null then raise exception 'Periodo nao oferecido' using errcode = 'P0001'; end if;

  -- horario precisa estar livre (mesma regra da coluna occupancy do 02)
  v_range := case
    when p_period = 'pernoite' then
      tsrange(p_date + p_time, greatest((p_date + 1) + time '12:00', p_date + p_time + interval '1 hour') + interval '30 minutes', '[)')
    else
      tsrange(p_date + p_time, p_date + p_time
        + case p_period when '3h' then interval '3 hours' when '6h' then interval '6 hours' else interval '12 hours' end
        + interval '30 minutes', '[)')
  end;
  if exists (
    select 1 from public.reservations r
    where r.motel_id = v_motel.id and r.suite_id = v_suite.id
      and r.status in ('confirmada', 'chegou') and r.occupancy && v_range
  ) then
    raise exception 'Horario indisponivel' using errcode = 'P0001';
  end if;

  -- protecao contra abuso: no maximo 30 pedidos pendentes por hora por motel
  if (select count(*) from public.reservations
      where motel_id = v_motel.id and status = 'pendente'
        and created_at > now() - interval '1 hour') >= 30 then
    raise exception 'Muitos pedidos agora. Tente novamente mais tarde' using errcode = 'P0001';
  end if;

  -- codigo unico (tenta de novo no raro caso de repeticao)
  for attempt in 1..5 loop
    v_code := '';
    for i in 1..6 loop
      v_code := v_code || substr(v_alphabet, 1 + floor(random() * length(v_alphabet))::int, 1);
    end loop;
    begin
      insert into public.reservations (
        motel_id, suite_id, code, guest_name, stay_date, period, arrival_time,
        total_cents, status, adult_confirmed, consent_at, terms_version
      ) values (
        v_motel.id, v_suite.id, v_code, nullif(left(trim(coalesce(p_guest, '')), 80), ''), p_date, p_period, p_time,
        v_price, 'pendente', true, now(), left(p_terms, 40)
      );
      insert into public.audit_logs (motel_id, actor_id, action, details)
      values (v_motel.id, null, 'pedido_cliente', json_build_object('code', v_code, 'suite', v_suite.number, 'date', p_date)::jsonb);
      return v_code;
    exception when unique_violation then
      -- codigo repetido: tenta outro
    end;
  end loop;
  raise exception 'Nao foi possivel gerar o codigo' using errcode = 'P0001';
end;
$$;

revoke all on function public.public_request_reservation(text, uuid, date, time, text, text, boolean, text) from public;
grant execute on function public.public_request_reservation(text, uuid, date, time, text, text, boolean, text) to anon, authenticated;


-- =====================================================================
-- PARA DESFAZER (se um dia precisar):
--   drop function if exists public.public_request_reservation(text, uuid, date, time, text, text, boolean, text);
--   drop function if exists public.public_motel_page(text);
--   -- (so volte a regra de situacao depois de nao haver mais reservas "pendente")
-- =====================================================================
