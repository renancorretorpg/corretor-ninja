-- Rodar uma vez no SQL Editor do Supabase (mesmo lugar do 001_etapas.sql)
-- Cria a tabela de campanhas de disparo.

create table if not exists public.campanhas (
  id bigint generated always as identity primary key,
  instance text not null,
  nome text not null,
  mensagens jsonb not null,
  imagens jsonb not null default '[]'::jsonb,
  destinatarios_modo text not null,
  destinatarios_etapa text,
  destinatarios_lead_ids jsonb,
  destinatarios_count integer not null default 0,
  agendamento_tipo text not null,
  agendamento_data timestamptz,
  status text not null default 'pendente_envio',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
