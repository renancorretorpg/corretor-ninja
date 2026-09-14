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

export interface Etapa {
  id: number;
  instance: string;
  nome: string;
  cor: string | null;
  ordem: number;
  leadCount: number;
  created_at: string;
  updated_at: string;
}

export interface ImagemDrive {
  id: string;
  nome: string;
  url: string;
}

export type DestinatariosModo = 'todos' | 'etapa' | 'manual';
export type AgendamentoTipo = 'imediato' | 'agendado';
export type CampanhaStatus = 'pendente_envio' | 'agendada' | 'enviada' | 'cancelada';

export interface Campanha {
  id: number;
  instance: string;
  nome: string;
  mensagens: string[];
  imagens: ImagemDrive[];
  destinatarios_modo: DestinatariosModo;
  destinatarios_etapa: string | null;
  destinatarios_lead_ids: number[] | null;
  destinatarios_count: number;
  agendamento_tipo: AgendamentoTipo;
  agendamento_data: string | null;
  status: CampanhaStatus;
  created_at: string;
  updated_at: string;
}

export interface NovaCampanhaPayload {
  nome?: string;
  mensagens: string[];
  imagens: ImagemDrive[];
  destinatarios_modo: DestinatariosModo;
  destinatarios_etapa?: string;
  destinatarios_lead_ids?: number[];
  agendamento_tipo: AgendamentoTipo;
  agendamento_data?: string;
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
