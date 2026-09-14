-- Rodar uma vez no SQL Editor do Supabase (mesmo lugar dos anteriores)
-- Adiciona suporte ao ciclo de vida real de disparo das campanhas.

alter table public.campanhas
  add column if not exists drive_pasta_campanha_id text,
  add column if not exists erro_mensagem text,
  add column if not exists enviado_em timestamptz;

-- status agora tambem assume 'enviando' e 'erro' alem dos valores existentes;
-- a coluna ja e texto livre (sem CHECK), entao nenhuma migracao de dado e necessaria.

create index if not exists campanhas_agendadas_idx
  on public.campanhas (status, agendamento_data)
  where status = 'agendada';
