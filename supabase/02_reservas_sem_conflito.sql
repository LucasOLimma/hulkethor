-- =====================================================================
-- ETAPA 2 | Reservas sem conflito de horario (protecao no proprio banco)
--
-- O QUE FAZ: impede que duas reservas ATIVAS (confirmada ou em andamento)
-- da MESMA suite ocupem horarios que se cruzam — mesmo que sejam salvas no
-- mesmo instante por duas pessoas. Mesmas regras do site:
--   * 3h / 6h / 12h a partir do horario de chegada;
--   * pernoite ate as 12:00 do dia seguinte (no minimo 1h);
--   * 30 minutos de limpeza depois de cada reserva;
--   * reserva antiga sem horario de chegada ocupa o dia inteiro.
--
-- NAO APAGA NEM ALTERA NENHUM DADO: so cria uma coluna calculada e uma regra.
-- Rode no SQL Editor do Supabase, UM PASSO POR VEZ, na ordem.
-- =====================================================================


-- ---------- PASSO 1: extensao necessaria para a regra ----------
create extension if not exists btree_gist;


-- ---------- PASSO 2: coluna calculada com o periodo de ocupacao ----------
-- (o banco calcula sozinho; ninguem precisa preencher)
alter table public.reservations
  add column if not exists occupancy tsrange
  generated always as (
    case
      when arrival_time is null then
        tsrange(stay_date::timestamp, (stay_date + 1)::timestamp, '[)')
      when period = 'pernoite' then
        tsrange(
          stay_date + arrival_time,
          greatest((stay_date + 1) + time '12:00', stay_date + arrival_time + interval '1 hour')
            + interval '30 minutes',
          '[)')
      else
        tsrange(
          stay_date + arrival_time,
          stay_date + arrival_time
            + case period when '3h' then interval '3 hours'
                          when '6h' then interval '6 hours'
                          else interval '12 hours' end
            + interval '30 minutes',
          '[)')
    end
  ) stored;


-- ---------- PASSO 3: conferir se JA existem reservas em conflito ----------
-- Esta consulta precisa voltar VAZIA. Se aparecer alguma linha, cancele ou
-- corrija uma das reservas listadas antes do passo 4.
select a.code as reserva_1, b.code as reserva_2, a.stay_date, s.number as suite
from public.reservations a
join public.reservations b
  on a.motel_id = b.motel_id and a.suite_id = b.suite_id and a.id < b.id
join public.suites s on s.id = a.suite_id
where a.status in ('confirmada', 'chegou')
  and b.status in ('confirmada', 'chegou')
  and a.occupancy && b.occupancy;


-- ---------- PASSO 4: a regra que impede o conflito ----------
alter table public.reservations
  add constraint reservations_sem_conflito
  exclude using gist (motel_id with =, suite_id with =, occupancy with &&)
  where (status in ('confirmada', 'chegou'));


-- =====================================================================
-- PARA DESFAZER (se um dia precisar), rode estas duas linhas:
--   alter table public.reservations drop constraint if exists reservations_sem_conflito;
--   alter table public.reservations drop column if exists occupancy;
-- =====================================================================
