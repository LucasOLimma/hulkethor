-- =====================================================================
-- ETAPA 7 | Portal do cliente: fotos das suites, disponibilidade e
--          "Minha Reserva" (Fase 2)
--
-- PRE-REQUISITO: 01 a 06 ja executados.
--
-- O QUE FAZ (so ACRESCENTA; nenhum dado existente e alterado ou apagado):
--   * Duas colunas NOVAS e OPCIONAIS (justificativa):
--       - reservations.guest_phone: celular do cliente, usado (junto com o
--         codigo) para ele consultar e cancelar a propria reserva, sem conta
--         e sem senha. Reservas antigas ficam sem celular.
--       - motel_settings.client_cancel_hours: ate quantas horas antes da
--         chegada o cliente pode cancelar (padrao 2; o dono muda).
--   * Fotos das suites: pasta publica "suite-photos" no Storage do Supabase
--     (so o DONO do motel envia/apaga, e so dentro da pasta do proprio
--     motel) + tabela suite_photos com a ordem das fotos (maximo 8).
--   * Pagina publica passa a mostrar as fotos.
--   * Disponibilidade: horarios JA OCUPADOS da suite no dia (sem nenhum dado
--     de hospede).
--   * Pedido com celular (nova funcao; a antiga continua existindo).
--   * "Minha Reserva": consulta e cancelamento com codigo + celular, com
--     limite de tentativas contra adivinhacao.
--
-- Rode o arquivo inteiro de uma vez. O fim mostra como desfazer.
-- =====================================================================


-- ---------- 1. COLUNAS NOVAS (opcionais) ----------

alter table public.reservations add column if not exists guest_phone text
  check (guest_phone is null or guest_phone ~ '^[0-9]{10,11}$');
alter table public.motel_settings add column if not exists client_cancel_hours integer not null default 2
  check (client_cancel_hours between 0 and 72);

-- "(11) 98765-4321", "+55 11 98765 4321" -> "11987654321" (null se invalido)
create or replace function public._phone_digits(p text)
returns text language sql immutable as $$
  select case
    when d ~ '^55[0-9]{10,11}$' then substr(d, 3)
    when d ~ '^[0-9]{10,11}$' then d
  end
  from (select regexp_replace(coalesce(p, ''), '[^0-9]', '', 'g') as d) x;
$$;
grant execute on function public._phone_digits(text) to authenticated;


-- ---------- 2. FOTOS DAS SUITES (Storage) ----------

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('suite-photos', 'suite-photos', true, 3145728, array['image/webp', 'image/jpeg', 'image/png'])
on conflict (id) do nothing;

create or replace function public._try_uuid(p text)
returns uuid language plpgsql immutable as $$
begin
  return p::uuid;
exception when others then
  return null;
end $$;
grant execute on function public._try_uuid(text) to authenticated;

-- caminho do arquivo: <motel_id>/<suite_id>/<arquivo>. So o dono do motel.
create policy suite_photos_upload on storage.objects for insert to authenticated
  with check (bucket_id = 'suite-photos'
              and public.has_role(public._try_uuid((storage.foldername(name))[1]), array['dono']));
create policy suite_photos_remove on storage.objects for delete to authenticated
  using (bucket_id = 'suite-photos'
         and public.has_role(public._try_uuid((storage.foldername(name))[1]), array['dono']));

create table public.suite_photos (
  id          uuid primary key default gen_random_uuid(),
  motel_id    uuid not null references public.motels(id) on delete cascade,
  suite_id    uuid not null,
  path        text not null unique,
  position    integer not null default 0,
  created_at  timestamptz not null default now(),
  foreign key (motel_id, suite_id) references public.suites (motel_id, id) on delete cascade,
  check (path like motel_id::text || '/' || suite_id::text || '/%' and length(path) <= 200)
);
create index on public.suite_photos (suite_id, position);

create or replace function public._suite_photos_limit()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if (select count(*) from public.suite_photos where suite_id = new.suite_id) >= 8 then
    raise exception using message = 'Cada suíte pode ter até 8 fotos.', errcode = 'P0001', hint = 'estoque';
  end if;
  return new;
end $$;
revoke all on function public._suite_photos_limit() from public, anon, authenticated;
create trigger trg_suite_photos_limit before insert on public.suite_photos
  for each row execute function public._suite_photos_limit();

alter table public.suite_photos enable row level security;
create policy suite_photos_select on public.suite_photos for select to authenticated
  using (public.is_member(motel_id));
create policy suite_photos_write on public.suite_photos for all to authenticated
  using (public.has_role(motel_id, array['dono'])) with check (public.has_role(motel_id, array['dono']));
revoke all on public.suite_photos from anon, authenticated;
grant select, insert, update, delete on public.suite_photos to authenticated;


-- ---------- 3. PAGINA PUBLICA (agora com fotos e regra de cancelamento) ----------

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
    'cancel_hours', coalesce((select client_cancel_hours from public.motel_settings where motel_id = m.id), 2),
    'suites', coalesce((
      select json_agg(json_build_object(
               'id', s.id,
               'number', s.number,
               'type', s.type,
               'prices_cents', s.prices_cents,
               'items', s.items,
               'photos', coalesce((select json_agg(p.path order by p.position, p.created_at)
                                     from public.suite_photos p where p.suite_id = s.id), '[]'::json)
             ) order by length(s.number), s.number)
      from public.suites s
      where s.motel_id = m.id and s.active
    ), '[]'::json)
  )
  from public.motels m
  where m.slug = lower(p_slug);
$$;


-- ---------- 4. DISPONIBILIDADE (horarios ja ocupados no dia) ----------

create or replace function public.public_availability(p_slug text, p_suite uuid, p_date date)
returns json
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_motel public.motels%rowtype;
  v_today date;
  v_day tsrange;
begin
  select * into v_motel from public.motels where slug = lower(p_slug);
  if not found or p_date is null then return '[]'::json; end if;
  if not exists (select 1 from public.suites where id = p_suite and motel_id = v_motel.id and active) then
    return '[]'::json;
  end if;
  v_today := (now() at time zone v_motel.timezone)::date;
  if p_date < v_today or p_date > v_today + 60 then return '[]'::json; end if;
  v_day := tsrange(p_date::timestamp, (p_date + 1)::timestamp, '[)');
  -- so os intervalos (ja com a limpeza); nada de codigo, nome ou valor
  return coalesce((
    select json_agg(json_build_object(
             'start', to_char(greatest(lower(r.occupancy), lower(v_day)), 'HH24:MI'),
             'end', case when upper(r.occupancy) >= upper(v_day) then '24:00' else to_char(upper(r.occupancy), 'HH24:MI') end
           ) order by lower(r.occupancy))
      from public.reservations r
     where r.motel_id = v_motel.id and r.suite_id = p_suite
       and r.status in ('confirmada', 'chegou') and r.occupancy && v_day
  ), '[]'::json);
end;
$$;
revoke all on function public.public_availability(text, uuid, date) from public;
grant execute on function public.public_availability(text, uuid, date) to anon, authenticated;


-- ---------- 5. PEDIDO COM CELULAR ----------
-- Usa a funcao do 03 (todas as validacoes continuam la) e grava o celular.

create or replace function public.public_request_reservation_v2(
  p_slug text, p_suite uuid, p_date date, p_time time, p_period text,
  p_guest text, p_phone text, p_adult boolean, p_terms text)
returns text
language plpgsql
volatile
security definer
set search_path = public
as $$
declare
  v_phone text := public._phone_digits(p_phone);
  v_code text;
begin
  if v_phone is null then
    raise exception 'Celular invalido' using errcode = 'P0001';
  end if;
  v_code := public.public_request_reservation(p_slug, p_suite, p_date, p_time, p_period, p_guest, p_adult, p_terms);
  update public.reservations r set guest_phone = v_phone
    from public.motels m
   where m.slug = lower(p_slug) and r.motel_id = m.id and r.code = v_code;
  return v_code;
end;
$$;
revoke all on function public.public_request_reservation_v2(text, uuid, date, time, text, text, text, boolean, text) from public;
grant execute on function public.public_request_reservation_v2(text, uuid, date, time, text, text, text, boolean, text) to anon, authenticated;


-- ---------- 6. MINHA RESERVA (codigo + celular) ----------

-- tentativas de consulta (protecao contra adivinhacao). So as funcoes usam.
create table public.public_lookup_attempts (
  id          bigint generated always as identity primary key,
  motel_id    uuid not null references public.motels(id) on delete cascade,
  code        text not null,
  success     boolean not null,
  created_at  timestamptz not null default now()
);
create index on public.public_lookup_attempts (motel_id, created_at);
alter table public.public_lookup_attempts enable row level security;
revoke all on public.public_lookup_attempts from anon, authenticated;

-- Encontra a reserva; registra a tentativa; barra excesso de erros
-- (5 erros no mesmo codigo, ou 200 erros no motel, em 15 minutos).
create or replace function public._public_find_reservation(p_slug text, p_code text, p_phone text)
returns uuid
language plpgsql
volatile
security definer
set search_path = public
as $$
declare
  v_motel uuid;
  v_code text := upper(regexp_replace(coalesce(p_code, ''), '[^A-Za-z0-9]', '', 'g'));
  v_phone text := public._phone_digits(p_phone);
  v_id uuid;
begin
  select id into v_motel from public.motels where slug = lower(p_slug);
  if v_motel is null or length(v_code) <> 6 then return null; end if;
  -- limpeza: tentativas antigas nao servem para nada
  delete from public.public_lookup_attempts where motel_id = v_motel and created_at < now() - interval '1 day';
  if (select count(*) from public.public_lookup_attempts
       where motel_id = v_motel and code = v_code and not success and created_at > now() - interval '15 minutes') >= 5
     or (select count(*) from public.public_lookup_attempts
          where motel_id = v_motel and not success and created_at > now() - interval '15 minutes') >= 200 then
    raise exception 'Muitas tentativas' using errcode = 'P0001';
  end if;
  select id into v_id from public.reservations
   where motel_id = v_motel and code = v_code and v_phone is not null and guest_phone = v_phone;
  insert into public.public_lookup_attempts (motel_id, code, success) values (v_motel, v_code, v_id is not null);
  return v_id;
end;
$$;
revoke all on function public._public_find_reservation(text, text, text) from public, anon, authenticated;

create or replace function public._public_reservation_json(p_id uuid)
returns json
language sql
stable
security definer
set search_path = public
as $$
  select json_build_object(
    'code', r.code,
    'status', r.status,
    'suite_number', s.number,
    'suite_type', s.type,
    'stay_date', r.stay_date,
    'arrival_time', to_char(r.arrival_time, 'HH24:MI'),
    'period', r.period,
    'total_cents', r.total_cents,
    'guest_name', r.guest_name,
    'cancel_hours', coalesce(ms.client_cancel_hours, 2),
    'can_cancel', r.status in ('pendente', 'confirmada') and r.arrival_time is not null
                  and (r.stay_date + r.arrival_time) - make_interval(hours => coalesce(ms.client_cancel_hours, 2))
                      > (now() at time zone m.timezone)
  )
  from public.reservations r
  join public.suites s on s.id = r.suite_id
  join public.motels m on m.id = r.motel_id
  left join public.motel_settings ms on ms.motel_id = r.motel_id
  where r.id = p_id;
$$;
revoke all on function public._public_reservation_json(uuid) from public, anon, authenticated;

create or replace function public.public_my_reservation(p_slug text, p_code text, p_phone text)
returns json
language plpgsql
volatile
security definer
set search_path = public
as $$
declare v_id uuid;
begin
  v_id := public._public_find_reservation(p_slug, p_code, p_phone);
  if v_id is null then return null; end if;
  return public._public_reservation_json(v_id);
end;
$$;
revoke all on function public.public_my_reservation(text, text, text) from public;
grant execute on function public.public_my_reservation(text, text, text) to anon, authenticated;

create or replace function public.public_cancel_reservation(p_slug text, p_code text, p_phone text)
returns json
language plpgsql
volatile
security definer
set search_path = public
as $$
declare
  v_id uuid;
  v_info json;
  v_motel uuid;
begin
  -- (nao usa "raise" quando nao encontra: a tentativa errada precisa ficar
  --  registrada para o limite contra adivinhacao)
  v_id := public._public_find_reservation(p_slug, p_code, p_phone);
  if v_id is null then return null; end if;
  perform 1 from public.reservations where id = v_id for update;
  v_info := public._public_reservation_json(v_id);
  if not (v_info->>'can_cancel')::boolean then
    raise exception 'Prazo de cancelamento encerrado' using errcode = 'P0001';
  end if;
  update public.reservations set status = 'cancelada' where id = v_id returning motel_id into v_motel;
  insert into public.audit_logs (motel_id, actor_id, action, details)
  values (v_motel, null, 'cancelado_cliente', json_build_object('code', v_info->>'code')::jsonb);
  return public._public_reservation_json(v_id);
end;
$$;
revoke all on function public.public_cancel_reservation(text, text, text) from public;
grant execute on function public.public_cancel_reservation(text, text, text) to anon, authenticated;


-- =====================================================================
-- COMO DESFAZER (as fotos enviadas ficam no Storage; apague a pasta
-- "suite-photos" no painel do Supabase se quiser):
--
-- drop function if exists public.public_cancel_reservation(text, text, text),
--   public.public_my_reservation(text, text, text), public._public_reservation_json(uuid),
--   public._public_find_reservation(text, text, text),
--   public.public_request_reservation_v2(text, uuid, date, time, text, text, text, boolean, text),
--   public.public_availability(text, uuid, date);
-- drop table if exists public.public_lookup_attempts, public.suite_photos;
-- drop function if exists public._suite_photos_limit();
-- drop policy if exists suite_photos_upload on storage.objects;
-- drop policy if exists suite_photos_remove on storage.objects;
-- alter table public.reservations drop column if exists guest_phone;
-- alter table public.motel_settings drop column if exists client_cancel_hours;
-- (a funcao public_motel_page volta a versao do 03 rodando o PASSO 2 do 03 de novo)
-- =====================================================================
