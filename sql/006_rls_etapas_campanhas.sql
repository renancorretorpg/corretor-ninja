-- Ja executado no SQL Editor do Supabase em 19/09/2026 (registro da migracao).
-- O Advisor do Supabase apontava "RLS Disabled in Public" em etapas e campanhas:
-- com a chave anon (publica no bundle do front) dava pra ler as duas tabelas.
-- O servidor do painel usa a service role, que ignora RLS, entao nada muda
-- pra ele. Sem policies, a anon/authenticated fica sem acesso, que e' o desejado.

alter table public.etapas enable row level security;
alter table public.campanhas enable row level security;
