-- Rodar uma vez no SQL Editor do Supabase (https://supabase.com/dashboard/project/duremdnjcbtrnuioelbl/sql/new)
-- Cria a tabela de etapas do funil, usada pela pagina de Cadastro de Etapas
-- e pelas colunas do Kanban de Leads.

create table if not exists public.etapas (
  id bigint generated always as identity primary key,
  instance text not null,
  nome text not null,
  cor text,
  ordem integer not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (instance, nome)
);
