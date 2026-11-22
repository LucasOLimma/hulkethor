-- =====================================================================
-- ETAPA 0 | Base do SaaS multi-motel (Supabase / Postgres)
-- PROPOSTA nova: nada aqui existia antes. Rode no SQL Editor do Supabase.
-- Principio: cada tabela tem motel_id e a seguranca por linha (RLS)
-- garante que um motel nunca enxerga dados de outro.
-- =====================================================================

-- ---------- 1. TABELAS ----------

create table public.motels (
  id          uuid primary key default gen_random_uuid(),
  name        text not null check (length(name) between 2 and 120),
  slug        text not null unique check (slug ~ '^[a-z0-9-]{3,40}$'),
  cnpj        text,
  address     text,
  latitude    double precision,
  longitude   double precision,
  timezone    text not null default 'America/Sao_Paulo',
  created_at  timestamptz not null default now()
);

-- Quem pertence a qual motel, e com qual perfil.
create table public.motel_members (
  motel_id    uuid not null references public.motels(id) on delete cascade,
  user_id     uuid not null references auth.users(id) on delete cascade,
  role        text not null check (role in ('dono','recepcao','camareira')),
  active      boolean not null default true,
  created_at  timestamptz not null default now(),
  primary key (motel_id, user_id)
);
create index on public.motel_members (user_id);

create table public.motel_settings (
  motel_id                    uuid primary key references public.motels(id) on delete cascade,
  smart_arrival_enabled       boolean not null default false,
  max_share_minutes           int not null default 90  check (max_share_minutes between 10 and 240),
  approach_threshold_minutes  int not null default 5   check (approach_threshold_minutes between 1 and 30),
  arrival_radius_m            int not null default 150 check (arrival_radius_m between 50 and 1000),
  privacy_mode                text not null default 'first_name'
                              check (privacy_mode in ('code_only','first_name','full_name')),
  retention_hours             int not null default 24  check (retention_hours between 1 and 168)
);

create table public.suites (
  id            uuid primary key default gen_random_uuid(),
  motel_id      uuid not null references public.motels(id) on delete cascade,
  number        text not null,
  type          text not null,
  prices_cents  jsonb not null default '{}'::jsonb,
  items         text[] not null default '{}',
  active        boolean not null default true,
  unique (motel_id, number),
  unique (motel_id, id)            -- permite a chave composta abaixo
);
create index on public.suites (motel_id);

create table public.reservations (
  id                uuid primary key default gen_random_uuid(),
  motel_id          uuid not null references public.motels(id) on delete cascade,
  suite_id          uuid not null,
  code              text not null,
  guest_name        text,
  stay_date         date not null,
  period            text not null check (period in ('3h','6h','12h','pernoite')),
  arrival_time      time,
  total_cents       integer not null check (total_cents >= 0),
  decoration        text,
  status            text not null default 'confirmada'
                    check (status in ('confirmada','cancelada','chegou','concluida','nao_compareceu')),
  adult_confirmed   boolean not null default false,
  consent_at        timestamptz,
  terms_version     text,
  created_at        timestamptz not null default now(),
  unique (motel_id, code),
  -- garante que a suite pertence ao MESMO motel da reserva
  foreign key (motel_id, suite_id) references public.suites (motel_id, id) on delete restrict
);
create index on public.reservations (motel_id, stay_date);

create table public.audit_logs (
  id          bigint generated always as identity primary key,
  motel_id    uuid not null references public.motels(id) on delete cascade,
  actor_id    uuid,
  action      text not null,
  details     jsonb not null default '{}'::jsonb,
  created_at  timestamptz not null default now()
);
create index on public.audit_logs (motel_id, created_at desc);

-- ---------- 2. FUNCOES AUXILIARES ----------

create or replace function public.is_member(m uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from public.motel_members
    where motel_id = m and user_id = auth.uid() and active
  );
$$;

create or replace function public.has_role(m uuid, roles text[])
returns boolean language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from public.motel_members
    where motel_id = m and user_id = auth.uid() and active and role = any(roles)
  );
$$;

revoke all on function public.is_member(uuid) from public, anon;
revoke all on function public.has_role(uuid, text[]) from public, anon;
grant execute on function public.is_member(uuid) to authenticated;
grant execute on function public.has_role(uuid, text[]) to authenticated;

-- Garante que sempre exista pelo menos um dono ativo por motel.
create or replace function public.protect_last_owner()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if old.role = 'dono' and old.active
     and (tg_op = 'DELETE' or new.role <> 'dono' or not new.active)
     and exists (select 1 from public.motels where id = old.motel_id) then
    if not exists (
      select 1 from public.motel_members
      where motel_id = old.motel_id and role = 'dono' and active and user_id <> old.user_id
    ) then
      raise exception 'O motel precisa ter pelo menos um dono ativo';
    end if;
  end if;
  return case when tg_op = 'DELETE' then old else new end;
end $$;

create trigger trg_protect_last_owner
  before update or delete on public.motel_members
  for each row execute function public.protect_last_owner();

-- Criar motel: SOMENTE voce (service_role) cria, apos contrato com o motel.
create or replace function public.create_motel(p_name text, p_slug text, p_owner uuid)
returns uuid language plpgsql security definer set search_path = public as $$
declare v_id uuid;
begin
  insert into public.motels (name, slug) values (p_name, p_slug) returning id into v_id;
  insert into public.motel_members (motel_id, user_id, role) values (v_id, p_owner, 'dono');
  insert into public.motel_settings (motel_id) values (v_id);
  insert into public.audit_logs (motel_id, actor_id, action) values (v_id, p_owner, 'motel_criado');
  return v_id;
end $$;
revoke all on function public.create_motel(text, text, uuid) from public, anon, authenticated;
grant execute on function public.create_motel(text, text, uuid) to service_role;

-- Registro de auditoria: so quem e membro do motel consegue gravar.
create or replace function public.log_audit(p_motel uuid, p_action text, p_details jsonb default '{}'::jsonb)
returns void language plpgsql security definer set search_path = public as $$
begin
  if not public.is_member(p_motel) then
    raise exception 'Sem permissao';
  end if;
  insert into public.audit_logs (motel_id, actor_id, action, details)
  values (p_motel, auth.uid(), p_action, coalesce(p_details, '{}'::jsonb));
end $$;
revoke all on function public.log_audit(uuid, text, jsonb) from public, anon;
grant execute on function public.log_audit(uuid, text, jsonb) to authenticated;

-- ---------- 3. SEGURANCA POR LINHA (RLS) ----------

alter table public.motels          enable row level security;
alter table public.motel_members   enable row level security;
alter table public.motel_settings  enable row level security;
alter table public.suites          enable row level security;
alter table public.reservations    enable row level security;
alter table public.audit_logs      enable row level security;

-- motels
create policy motels_select on public.motels for select to authenticated
  using (public.is_member(id));
create policy motels_update on public.motels for update to authenticated
  using (public.has_role(id, array['dono'])) with check (public.has_role(id, array['dono']));

-- motel_members: cada um ve a propria linha; o dono ve e gerencia a equipe
create policy members_select on public.motel_members for select to authenticated
  using (user_id = auth.uid() or public.has_role(motel_id, array['dono']));
create policy members_insert on public.motel_members for insert to authenticated
  with check (public.has_role(motel_id, array['dono']));
create policy members_update on public.motel_members for update to authenticated
  using (public.has_role(motel_id, array['dono'])) with check (public.has_role(motel_id, array['dono']));
create policy members_delete on public.motel_members for delete to authenticated
  using (public.has_role(motel_id, array['dono']));

-- motel_settings
create policy settings_select on public.motel_settings for select to authenticated
  using (public.is_member(motel_id));
create policy settings_update on public.motel_settings for update to authenticated
  using (public.has_role(motel_id, array['dono'])) with check (public.has_role(motel_id, array['dono']));

-- suites: toda a equipe ve; so o dono altera
create policy suites_select on public.suites for select to authenticated
  using (public.is_member(motel_id));
create policy suites_write on public.suites for all to authenticated
  using (public.has_role(motel_id, array['dono'])) with check (public.has_role(motel_id, array['dono']));

-- reservations: dono e recepcao (camareira NAO ve dados de hospedes)
create policy reservations_select on public.reservations for select to authenticated
  using (public.has_role(motel_id, array['dono','recepcao']));
create policy reservations_insert on public.reservations for insert to authenticated
  with check (public.has_role(motel_id, array['dono','recepcao']));
create policy reservations_update on public.reservations for update to authenticated
  using (public.has_role(motel_id, array['dono','recepcao']))
  with check (public.has_role(motel_id, array['dono','recepcao']));

-- audit_logs: so o dono le. Ninguem grava direto (apenas pela funcao log_audit).
create policy audit_select on public.audit_logs for select to authenticated
  using (public.has_role(motel_id, array['dono']));

-- ---------- 4. PERMISSOES DE TABELA ----------
-- Visitantes sem login (anon) nao acessam NADA. Reservas de clientes sem
-- login passarao por uma funcao de servidor propria (proxima etapa).

revoke all on all tables in schema public from anon, authenticated;
grant select, update                 on public.motels         to authenticated;
grant select, insert, update, delete on public.motel_members  to authenticated;
grant select, update                 on public.motel_settings to authenticated;
grant select, insert, update, delete on public.suites         to authenticated;
grant select, insert, update         on public.reservations   to authenticated;
grant select                         on public.audit_logs     to authenticated;
