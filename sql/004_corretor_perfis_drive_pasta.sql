-- Rodar uma vez no SQL Editor do Supabase (mesmo lugar dos anteriores)
-- Adiciona a pasta de imagens de campanha (Drive) por corretor, pro painel
-- resolver a pasta certa por sessao logada em vez de um env var fixo.
-- Duplica o valor que ja existe na Data Table "clientes" do n8n (coluna
-- drive_pasta_teasers) -- se um corretor trocar de pasta no Drive, precisa
-- atualizar nos dois lugares.

alter table public.corretor_perfis
  add column if not exists drive_pasta_teasers text;

update public.corretor_perfis set drive_pasta_teasers = '11c5TQajvDGydYRojViGIWjGPjTw7K9s5' where instance = 'Renan';
update public.corretor_perfis set drive_pasta_teasers = '1ruWlnUZoATQONwtJwFRvdij8-CN9nLJy' where instance = 'misleine';
update public.corretor_perfis set drive_pasta_teasers = '1dFkgxTbLO6QO10nrjo3Sif8INfUCNfeT' where instance = 'henrique';
