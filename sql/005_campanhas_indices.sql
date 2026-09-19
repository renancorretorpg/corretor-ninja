-- Rodar uma vez no SQL Editor do Supabase (mesmo lugar dos anteriores).
-- Indices pra listagem e filtros de campanhas por corretor. Todas as consultas
-- do painel filtram por `instance`, e a listagem ordena por criacao.

create index if not exists campanhas_instance_created_idx
  on public.campanhas (instance, created_at desc);

-- Suporta o lookup por (id, instance) usado no cancelamento e no callback de
-- status do n8n (o id ja e chave primaria; este cobre o filtro combinado).
create index if not exists campanhas_instance_status_idx
  on public.campanhas (instance, status);
