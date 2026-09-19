-- Schema public do Supabase (projeto secretariadocorretor), exportado em 19/09/2026.
--
-- ATENCAO: e' uma RECONSTRUCAO por consulta (pg_class/pg_indexes/pg_policies etc.),
-- nao um pg_dump exato. Serve pra documentar e recriar a estrutura. Nao inclui:
--   - dados;
--   - "generated ... as identity" das colunas id (os `id bigint not null` abaixo
--     provavelmente sao identity/sequence no banco real);
--   - grants/permissoes;
--   - o "with check" das policies;
--   - o schema auth (logins), gerenciado pelo Supabase.
-- As migracoes numeradas 001-007 ao lado descrevem a historia; este arquivo e' o retrato atual.
--
-- Estado relevante em 19/09/2026:
--   - RLS ligado nas 6 tabelas (etapas e campanhas foram ligadas hoje, ver 006).
--   - O gatilho legado on_auth_user_created_ligar_corretor (em auth.users) foi removido (ver 007);
--     a funcao public.ligar_corretor_perfil() continua no banco, sem uso.
--   - O painel acessa o banco com a service role (ignora RLS); a anon so' e' usada pro login.

-- ===== Tabelas =====

create table public.campanhas (
  id bigint not null,
  instance text not null,
  nome text not null,
  mensagens jsonb not null,
  imagens jsonb not null default '[]'::jsonb,
  destinatarios_modo text not null,
  destinatarios_etapa text,
  destinatarios_lead_ids jsonb,
  destinatarios_count integer not null default 0,
  agendamento_tipo text not null,
  agendamento_data timestamp with time zone,
  status text not null default 'pendente_envio'::text,
  created_at timestamp with time zone not null default now(),
  updated_at timestamp with time zone not null default now(),
  drive_pasta_campanha_id text,
  erro_mensagem text,
  enviado_em timestamp with time zone
);

create table public.convites_corretor (
  id bigint not null,
  token text not null,
  status text not null default 'pendente'::text,
  nome_corretor text,
  whatsapp_numero text,
  email text,
  senha text,
  crm_login text,
  crm_senha text,
  drive_pasta_teasers text,
  criado_em timestamp with time zone not null default now(),
  preenchido_em timestamp with time zone,
  finalizado_em timestamp with time zone
);

create table public.corretor_emails (
  email text not null,
  instance text not null
);

create table public.corretor_perfis (
  user_id uuid not null,
  instance text not null,
  drive_pasta_teasers text,
  is_admin boolean not null default false
);

create table public.etapas (
  id bigint not null,
  instance text not null,
  nome text not null,
  cor text,
  ordem integer not null,
  created_at timestamp with time zone not null default now(),
  updated_at timestamp with time zone not null default now()
);

create table public.leads (
  id bigint not null,
  instance text not null,
  nome text,
  numero text not null,
  status text not null default 'novo'::text,
  created_at timestamp with time zone not null default now(),
  updated_at timestamp with time zone not null default now(),
  notas text,
  historico_conversa jsonb not null default '[]'::jsonb,
  origem text,
  sobrenome text
);

-- ===== Constraints =====

alter table public.campanhas add constraint campanhas_pkey primary key (id);

alter table public.convites_corretor add constraint convites_corretor_pkey primary key (id);
alter table public.convites_corretor add constraint convites_corretor_token_key unique (token);
alter table public.convites_corretor add constraint convites_corretor_status_check
  check (status = any (array['pendente'::text, 'preenchido'::text, 'finalizado'::text]));

alter table public.corretor_emails add constraint corretor_emails_pkey primary key (email);

alter table public.corretor_perfis add constraint corretor_perfis_pkey primary key (user_id);
alter table public.corretor_perfis add constraint corretor_perfis_instance_key unique (instance);
alter table public.corretor_perfis add constraint corretor_perfis_user_id_fkey
  foreign key (user_id) references auth.users(id) on delete cascade;

alter table public.etapas add constraint etapas_pkey primary key (id);
alter table public.etapas add constraint etapas_instance_nome_key unique (instance, nome);

alter table public.leads add constraint leads_pkey primary key (id);

-- ===== Indices (alem dos criados pelas constraints acima) =====

create index campanhas_agendadas_idx on public.campanhas using btree (status, agendamento_data)
  where (status = 'agendada'::text);
create index campanhas_instance_created_idx on public.campanhas using btree (instance, created_at desc);
create index campanhas_instance_status_idx on public.campanhas using btree (instance, status);

create index leads_instance_idx on public.leads using btree (instance);
create unique index leads_instance_numero_idx on public.leads using btree (instance, numero);

-- ===== Funcoes e gatilhos =====

create or replace function public.set_updated_at() returns trigger language plpgsql as $function$
begin new.updated_at = now(); return new; end;
$function$;

create trigger leads_set_updated_at before update on public.leads
  for each row execute function set_updated_at();

-- Sem uso desde 19/09/2026 (o gatilho que a chamava foi removido, ver 007).
create or replace function public.ligar_corretor_perfil() returns trigger
language plpgsql security definer as $function$
begin
  insert into public.corretor_perfis (user_id, instance)
  select new.id, ce.instance
  from public.corretor_emails ce
  where lower(ce.email) = lower(new.email)
  on conflict (user_id) do nothing;
  return new;
end;
$function$;

-- ===== RLS e policies =====

alter table public.campanhas enable row level security;
alter table public.convites_corretor enable row level security;
alter table public.corretor_emails enable row level security;
alter table public.corretor_perfis enable row level security;
alter table public.etapas enable row level security;
alter table public.leads enable row level security;

create policy "usuario ve so o proprio perfil" on public.corretor_perfis
  for select using (user_id = auth.uid());

create policy "corretor ve so os proprios leads" on public.leads
  for select using (instance = (select corretor_perfis.instance from corretor_perfis where corretor_perfis.user_id = auth.uid()));

create policy "corretor edita so os proprios leads" on public.leads
  for all using (instance = (select corretor_perfis.instance from corretor_perfis where corretor_perfis.user_id = auth.uid()));

-- campanhas, etapas, convites_corretor e corretor_emails: RLS ligado e sem policies
-- (acesso so' pela service role do servidor do painel).
