export interface HistoricoConversa {
  resumo?: string;
  periodo_dias?: number;
  atualizado_em?: string;
  teve_interacao?: boolean;
}

export interface Lead {
  id: number;
  instance: string;
  nome: string;
  sobrenome: string | null;
  numero: string;
  status: string;
  origem: string | null;
  notas: string | null;
  historico_conversa: HistoricoConversa | null;
  created_at: string;
  updated_at: string;
}

export interface LeadsResponse {
  data: Lead[];
  total: number;
  page: number;
  pageSize: number;
}

export interface LeadsFilters {
  page: number;
  pageSize: number;
  status?: string;
  origem?: string;
  search?: string;
  sortBy?: string;
  sortDir?: 'asc' | 'desc';
}
