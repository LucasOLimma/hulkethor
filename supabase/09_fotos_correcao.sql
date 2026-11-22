-- =====================================================================
-- ETAPA 9 | Correcao: envio das fotos das suites
--
-- PROBLEMA: ao enviar uma foto, o Storage do Supabase grava o arquivo e
-- LE DE VOLTA o registro criado. O 07 so criou as regras de gravar e de
-- apagar; sem a regra de LEITURA, o banco recusava o envio e a foto nao
-- era salva.
--
-- O QUE FAZ: cria a regra de leitura da pasta "suite-photos" para a
-- equipe do motel dono daquela pasta (a pasta continua publica para ver
-- as fotos pelo endereco; enviar e apagar continuam so com o dono).
-- Nao altera dados. Pode rodar de novo sem problema.
-- =====================================================================

drop policy if exists suite_photos_read on storage.objects;
create policy suite_photos_read on storage.objects for select to authenticated
  using (bucket_id = 'suite-photos'
         and public.is_member(public._try_uuid((storage.foldername(name))[1])));

-- COMO DESFAZER:
--   drop policy if exists suite_photos_read on storage.objects;
