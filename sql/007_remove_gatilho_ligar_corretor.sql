-- Rodar uma vez no SQL Editor do Supabase.
--
-- Problema: existia um gatilho legado em auth.users (on_auth_user_created_ligar_corretor)
-- que, ao nascer um login cujo e-mail esta em public.corretor_emails, ja inseria a linha
-- em corretor_perfis (com a instance antiga mapeada nessa tabela). O painel atual cria o
-- perfil explicitamente logo depois de criar o login (criarCorretorCompleto e
-- vincularAcessoPainel em server/app.js), entao o insert do painel batia na linha do
-- gatilho: erro 23505 "corretor_perfis_pkey", e o painel apagava o login recem-criado.
-- O painel nao le corretor_emails em lugar nenhum. O gatilho so dispara em logins NOVOS,
-- entao remove-lo nao afeta nenhum corretor que ja existe.

drop trigger if exists on_auth_user_created_ligar_corretor on auth.users;

-- A funcao public.ligar_corretor_perfil() fica no banco, sem uso. Pra desfazer, recrie o gatilho:
--   create trigger on_auth_user_created_ligar_corretor
--     after insert on auth.users
--     for each row execute function public.ligar_corretor_perfil();
--
-- Definicao original da funcao (registro):
--   create or replace function public.ligar_corretor_perfil() returns trigger
--   language plpgsql security definer as $function$
--   begin
--     insert into public.corretor_perfis (user_id, instance)
--     select new.id, ce.instance
--     from public.corretor_emails ce
--     where lower(ce.email) = lower(new.email)
--     on conflict (user_id) do nothing;
--     return new;
--   end;
--   $function$
