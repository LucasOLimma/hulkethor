-- =====================================================================
-- ETAPA 8 | Mapa das suites ao vivo + previsao de quando cada uma fica pronta
--
-- PRE-REQUISITO: 01 a 07 ja executados.
--
-- O QUE FAZ (nao cria tabela nem altera dados):
--   * Funcao suite_board(motel): a situacao de cada suite AGORA, para toda a
--     equipe (camareira inclusive), SEM nenhum dado de hospede (nem nome,
--     nem codigo, nem valor): so suite, situacao e horarios.
--       - ocupada (reserva em andamento) + saida prevista
--       - em limpeza (aguardando ou limpando) + desde quando
--       - com problema
--       - livre (+ proxima reserva confirmada do dia, se houver)
--       - desativada
--   * Tempo medio REAL de limpeza (da saida ate liberar), por suite e do
--     motel, nos ultimos 30 dias. E a base da previsao.
--   * Liga o "tempo real" do Supabase (Realtime) para as tabelas de
--     limpeza e reservas: a tela atualiza sozinha quando algo muda.
--     O Realtime respeita as regras de seguranca (RLS): cada pessoa so
--     recebe o que ja podia ver.
--
-- Pode rodar de novo sem problema. O fim mostra como desfazer.
-- =====================================================================


create index if not exists housekeeping_tasks_finished
  on public.housekeeping_tasks (motel_id, finished_at) where status = 'concluida';

create or replace function public.suite_board(p_motel uuid)
returns json
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_tz text;
  v_now timestamp;
  v_today date;
  v_motel_avg numeric;
begin
  if not public.is_member(p_motel) then raise exception 'Sem permissao'; end if;
  select timezone into v_tz from public.motels where id = p_motel;
  v_now := now() at time zone v_tz;
  v_today := v_now::date;

  -- media do motel (minutos da saida ate liberar), ultimos 30 dias, so tempos plausiveis
  select avg(extract(epoch from (finished_at - checkout_at)) / 60) into v_motel_avg
    from public.housekeeping_tasks
   where motel_id = p_motel and status = 'concluida' and condition is distinct from 'problema'
     and finished_at > now() - interval '30 days'
     and finished_at - checkout_at between interval '3 minutes' and interval '4 hours';

  return json_build_object(
    'now', to_char(v_now, 'YYYY-MM-DD"T"HH24:MI:SS'),
    'motel_avg_min', round(v_motel_avg),
    'suites', coalesce((
      select json_agg(x order by length(x.number), x.number)
      from (
        select
          s.id,
          s.number,
          s.type,
          s.active,
          case
            when not s.active then 'desativada'
            when occ.id is not null then 'ocupada'
            when t.status = 'problema' then 'problema'
            when t.id is not null then 'limpeza'
            else 'livre'
          end as status,
          -- ocupada: saida prevista (fim do periodo, sem o tempo de limpeza do 02)
          case when occ.id is not null then to_char(upper(occ.occupancy) - interval '30 minutes', 'YYYY-MM-DD"T"HH24:MI:SS') end as checkout_expected,
          -- limpeza: desde quando a suite esta livre para limpar, e se ja comecou
          case when t.id is not null then to_char(t.checkout_at at time zone v_tz, 'YYYY-MM-DD"T"HH24:MI:SS') end as dirty_since,
          t.status as task_status,
          case when t.started_at is not null then to_char(t.started_at at time zone v_tz, 'YYYY-MM-DD"T"HH24:MI:SS') end as cleaning_started,
          t.notes as problem_notes,
          -- proxima reserva confirmada que ainda vai comecar hoje
          (select to_char(lower(r.occupancy), 'HH24:MI') from public.reservations r
            where r.suite_id = s.id and r.status = 'confirmada' and lower(r.occupancy) >= v_now
              and lower(r.occupancy)::date = v_today
            order by lower(r.occupancy) limit 1) as next_reservation,
          (select round(avg(extract(epoch from (h.finished_at - h.checkout_at)) / 60))
             from public.housekeeping_tasks h
            where h.suite_id = s.id and h.status = 'concluida' and h.condition is distinct from 'problema'
              and h.finished_at > now() - interval '30 days'
              and h.finished_at - h.checkout_at between interval '3 minutes' and interval '4 hours') as avg_clean_min,
          (select count(*) from public.housekeeping_tasks h
            where h.suite_id = s.id and h.status = 'concluida' and h.condition is distinct from 'problema'
              and h.finished_at > now() - interval '30 days'
              and h.finished_at - h.checkout_at between interval '3 minutes' and interval '4 hours') as samples
        from public.suites s
        left join lateral (
          select r.id, r.occupancy from public.reservations r
           where r.suite_id = s.id and r.status = 'chegou'
           order by lower(r.occupancy) desc limit 1
        ) occ on true
        left join lateral (
          select h.* from public.housekeeping_tasks h
           where h.suite_id = s.id and h.status in ('aguardando', 'em_limpeza', 'problema')
           limit 1
        ) t on true
        where s.motel_id = p_motel
      ) x
    ), '[]'::json)
  );
end;
$$;
revoke all on function public.suite_board(uuid) from public, anon;
grant execute on function public.suite_board(uuid) to authenticated;


-- Tempo real (Realtime): so se o Supabase tiver a "publicacao" padrao.
do $$
begin
  if exists (select 1 from pg_publication where pubname = 'supabase_realtime') then
    if not exists (select 1 from pg_publication_tables where pubname = 'supabase_realtime'
                    and schemaname = 'public' and tablename = 'housekeeping_tasks') then
      alter publication supabase_realtime add table public.housekeeping_tasks;
    end if;
    if not exists (select 1 from pg_publication_tables where pubname = 'supabase_realtime'
                    and schemaname = 'public' and tablename = 'reservations') then
      alter publication supabase_realtime add table public.reservations;
    end if;
  end if;
end $$;


-- =====================================================================
-- COMO DESFAZER:
--   drop function if exists public.suite_board(uuid);
--   drop index if exists public.housekeeping_tasks_finished;
--   alter publication supabase_realtime drop table public.housekeeping_tasks;
--   alter publication supabase_realtime drop table public.reservations;
-- =====================================================================
