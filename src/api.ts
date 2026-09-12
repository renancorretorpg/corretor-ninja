import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type { Lead, LeadsFilters, LeadsResponse } from './types';

async function fetchJson<T>(url: string, init?: RequestInit): Promise<T> {
  const res = await fetch(url, {
    headers: { 'Content-Type': 'application/json' },
    ...init,
  });
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
