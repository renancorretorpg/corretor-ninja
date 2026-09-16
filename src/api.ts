import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { supabase } from './supabaseClient';
import type {
  AtualizarCorretorPayload,
  Campanha,
  Convite,
  Corretor,
  DestinatariosModo,
  Etapa,
  ImagemDrive,
  Lead,
  LeadsFilters,
  LeadsResponse,
  Me,
  NovaCampanhaPayload,
  NovoCorretorPayload,
  NovoCorretorResultado,
  NovoLeadPayload,
  PreencherConvitePayload,
  VincularAcessoPayload,
  QrCodeResultado,
} from './types';

async function fetchJson<T>(url: string, init?: RequestInit): Promise<T> {
  const {
    data: { session },
  } = await supabase.auth.getSession();

  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
    ...(init?.headers as Record<string, string> | undefined),
  };
  if (session?.access_token) {
    headers.Authorization = `Bearer ${session.access_token}`;
  }

  const res = await fetch(url, { ...init, headers });

  if (res.status === 401) {
    await supabase.auth.signOut();
    throw new Error('Sessão expirada. Faça login novamente.');
  }
  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    throw new Error(body.error || `Erro ${res.status}`);
  }
  return res.json();
}

function buildQuery(filters: LeadsFilters): string {
  const params = new URLSearchParams();
  params.set('page', String(filters.page));
  params.set('pageSize', String(filters.pageSize));
  if (filters.status) params.set('status', filters.status);
  if (filters.origem) params.set('origem', filters.origem);
  if (filters.search) params.set('search', filters.search);
  if (filters.sortBy) params.set('sortBy', filters.sortBy);
  if (filters.sortDir) params.set('sortDir', filters.sortDir);
  return params.toString();
}

export function useLeads(filters: LeadsFilters) {
  return useQuery({
    queryKey: ['leads', filters],
    queryFn: () => fetchJson<LeadsResponse>(`/api/leads?${buildQuery(filters)}`),
    placeholderData: (prev) => prev,
  });
}

export function useAllLeadsForKanban(instanceFilters: Pick<LeadsFilters, 'status' | 'origem' | 'search'>) {
  // Kanban carrega um lote maior (sem paginacao) para poder distribuir nas colunas
  return useQuery({
    queryKey: ['leads-kanban', instanceFilters],
    queryFn: () =>
      fetchJson<LeadsResponse>(
        `/api/leads?${buildQuery({ page: 1, pageSize: 100, ...instanceFilters })}`,
      ),
  });
}

export function useStatuses() {
  return useQuery({
    queryKey: ['statuses'],
    queryFn: () => fetchJson<{ statuses: string[] }>('/api/leads/statuses'),
  });
}

export function useOrigens() {
  return useQuery({
    queryKey: ['origens'],
    queryFn: () => fetchJson<{ origens: string[] }>('/api/leads/origens'),
  });
}

export function useCreateLead() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (payload: NovoLeadPayload) =>
      fetchJson<{ data: Lead }>('/api/leads', {
        method: 'POST',
        body: JSON.stringify(payload),
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['leads'] });
      queryClient.invalidateQueries({ queryKey: ['leads-kanban'] });
      queryClient.invalidateQueries({ queryKey: ['statuses'] });
      queryClient.invalidateQueries({ queryKey: ['origens'] });
    },
  });
}

export function useUpdateLead() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ id, updates }: { id: number; updates: Partial<Lead> }) =>
      fetchJson<{ data: Lead }>(`/api/leads/${id}`, {
        method: 'PATCH',
        body: JSON.stringify(updates),
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['leads'] });
      queryClient.invalidateQueries({ queryKey: ['leads-kanban'] });
      queryClient.invalidateQueries({ queryKey: ['statuses'] });
    },
  });
}

export function useDeleteLead() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (id: number) => fetchJson<{ ok: true }>(`/api/leads/${id}`, { method: 'DELETE' }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['leads'] });
      queryClient.invalidateQueries({ queryKey: ['leads-kanban'] });
      queryClient.invalidateQueries({ queryKey: ['statuses'] });
    },
  });
}

export function useEtapas() {
  return useQuery({
    queryKey: ['etapas'],
    queryFn: () => fetchJson<{ data: Etapa[] }>('/api/etapas'),
  });
}

function invalidateEtapas(queryClient: ReturnType<typeof useQueryClient>) {
  queryClient.invalidateQueries({ queryKey: ['etapas'] });
  queryClient.invalidateQueries({ queryKey: ['leads'] });
  queryClient.invalidateQueries({ queryKey: ['leads-kanban'] });
  queryClient.invalidateQueries({ queryKey: ['statuses'] });
}

export function useCreateEtapa() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (payload: { nome: string; cor?: string }) =>
      fetchJson<{ data: Etapa }>('/api/etapas', {
        method: 'POST',
        body: JSON.stringify(payload),
      }),
    onSuccess: () => invalidateEtapas(queryClient),
  });
}

export function useUpdateEtapa() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ id, updates }: { id: number; updates: { nome?: string; cor?: string } }) =>
      fetchJson<{ data: Etapa }>(`/api/etapas/${id}`, {
        method: 'PATCH',
        body: JSON.stringify(updates),
      }),
    onSuccess: () => invalidateEtapas(queryClient),
  });
}

export function useReorderEtapas() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (itens: { id: number; ordem: number }[]) =>
      fetchJson<{ ok: true }>('/api/etapas/reorder', {
        method: 'POST',
        body: JSON.stringify({ itens }),
      }),
    onSuccess: () => invalidateEtapas(queryClient),
  });
}

export function useDeleteEtapa() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ id, moveTo }: { id: number; moveTo?: string }) =>
      fetchJson<{ ok: true }>(`/api/etapas/${id}`, {
        method: 'DELETE',
        body: JSON.stringify({ moveTo }),
      }),
    onSuccess: () => invalidateEtapas(queryClient),
  });
}

export function useBuscarLeads(search: string) {
  return useQuery({
    queryKey: ['leads-busca', search],
    queryFn: () =>
      fetchJson<LeadsResponse>(`/api/leads?${buildQuery({ page: 1, pageSize: 20, search })}`),
    enabled: search.trim().length >= 2,
  });
}

export function useCampanhaImagens() {
  return useQuery({
    queryKey: ['campanha-imagens'],
    queryFn: () => fetchJson<{ configurado: boolean; imagens: ImagemDrive[] }>('/api/campanhas/imagens'),
  });
}

// Sobe foto(s) novas pra pasta do Drive do corretor (adiciona, nao substitui
// as que ja estao la). imagens: base64 sem o prefixo "data:...;base64,".
export function useUploadCampanhaImagens() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (imagens: { base64: string; fileName: string; mimetype: string }[]) =>
      fetchJson<{ files: ImagemDrive[] }>('/api/campanhas/imagens/upload', {
        method: 'POST',
        body: JSON.stringify({ imagens }),
      }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['campanha-imagens'] }),
  });
}

export function useDestinatariosContagem(
  modo: DestinatariosModo,
  etapa: string | undefined,
  leadIds: number[],
) {
  const params = new URLSearchParams({ modo });
  if (modo === 'etapa' && etapa) params.set('etapa', etapa);
  if (modo === 'manual') params.set('ids', leadIds.join(','));
  const habilitado = modo === 'todos' || (modo === 'etapa' && !!etapa) || (modo === 'manual' && leadIds.length > 0);

  return useQuery({
    queryKey: ['destinatarios-contagem', modo, etapa, leadIds],
    queryFn: () => fetchJson<{ count: number }>(`/api/campanhas/destinatarios/contagem?${params.toString()}`),
    enabled: habilitado,
  });
}

export function useCampanhas() {
  return useQuery({
    queryKey: ['campanhas'],
    queryFn: () => fetchJson<{ data: Campanha[] }>('/api/campanhas'),
  });
}

export function useCreateCampanha() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (payload: NovaCampanhaPayload) =>
      fetchJson<{ data: Campanha }>('/api/campanhas', {
        method: 'POST',
        body: JSON.stringify(payload),
      }),
    // Mesmo quando falha (ex.: erro ao copiar imagens), a campanha pode ter
    // sido criada com status 'erro' -- atualiza o histórico pra ela aparecer.
    onSettled: () => queryClient.invalidateQueries({ queryKey: ['campanhas'] }),
  });
}

export function useCancelarCampanha() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (id: number) => fetchJson<{ ok: true }>(`/api/campanhas/${id}`, { method: 'DELETE' }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['campanhas'] }),
  });
}

export function useMe() {
  return useQuery({
    queryKey: ['me'],
    queryFn: () => fetchJson<Me>('/api/me'),
  });
}

export function useCorretoresAdmin() {
  return useQuery({
    queryKey: ['admin-corretores'],
    queryFn: () => fetchJson<{ data: Corretor[] }>('/api/admin/corretores'),
  });
}

export function useUpdateCorretor() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ instance, payload }: { instance: string; payload: AtualizarCorretorPayload }) =>
      fetchJson<{ ok: true; data: Corretor }>(`/api/admin/corretores/${encodeURIComponent(instance)}`, {
        method: 'PATCH',
        body: JSON.stringify(payload),
      }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['admin-corretores'] }),
  });
}

export function useDeleteCorretor() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (instance: string) =>
      fetchJson<{ ok: true }>(`/api/admin/corretores/${encodeURIComponent(instance)}`, { method: 'DELETE' }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['admin-corretores'] }),
  });
}

export function useGerarQrCodeCorretor() {
  return useMutation({
    mutationFn: (instance: string) =>
      fetchJson<QrCodeResultado>(`/api/admin/corretores/${encodeURIComponent(instance)}/qrcode`, {
        method: 'POST',
      }),
  });
}

export function useCreateCorretor() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (payload: NovoCorretorPayload) =>
      fetchJson<NovoCorretorResultado>('/api/admin/corretores', {
        method: 'POST',
        body: JSON.stringify(payload),
      }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['admin-corretores'] }),
  });
}

export function useVincularAcesso() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (payload: VincularAcessoPayload) =>
      fetchJson<{ ok: true; instance: string }>('/api/admin/corretores/vincular', {
        method: 'POST',
        body: JSON.stringify(payload),
      }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['admin-corretores'] }),
  });
}

export function useConvitesAdmin() {
  return useQuery({
    queryKey: ['admin-convites'],
    queryFn: () => fetchJson<{ data: Convite[] }>('/api/admin/convites'),
  });
}

export function useCreateConvite() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: () => fetchJson<{ token: string; url: string }>('/api/admin/convites', { method: 'POST' }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['admin-convites'] }),
  });
}

export function useDeleteConvite() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (id: number) => fetchJson<{ ok: true }>(`/api/admin/convites/${id}`, { method: 'DELETE' }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['admin-convites'] }),
  });
}

export function useFinalizarConvite() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ id, instance }: { id: number; instance: string }) =>
      fetchJson<NovoCorretorResultado>(`/api/admin/convites/${id}/finalizar`, {
        method: 'POST',
        body: JSON.stringify({ instance }),
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['admin-convites'] });
      queryClient.invalidateQueries({ queryKey: ['admin-corretores'] });
    },
  });
}

// Rota publica (sem sessao) usada na pagina de convite -- fetchJson so
// anexa o Bearer token se houver uma sessao ativa, entao funciona normal
// pra um visitante sem login.
export function useConviteValido(token: string) {
  return useQuery({
    queryKey: ['convite', token],
    queryFn: () => fetchJson<{ valido: true }>(`/api/convites/${token}`),
    retry: false,
  });
}

export function usePreencherConvite(token: string) {
  return useMutation({
    mutationFn: (payload: PreencherConvitePayload) =>
      fetchJson<{ ok: true }>(`/api/convites/${token}`, {
        method: 'POST',
        body: JSON.stringify(payload),
      }),
  });
}
