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
export type CampanhaStatus = 'pendente_envio' | 'agendada' | 'enviando' | 'enviada' | 'erro' | 'cancelada';

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
  drive_pasta_campanha_id: string | null;
  erro_mensagem: string | null;
  enviado_em: string | null;
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

export interface NovoLeadPayload {
  nome: string;
  sobrenome?: string;
  numero: string;
  status?: string;
  origem?: string;
  notas?: string;
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

export interface Me {
  instance: string;
  is_admin: boolean;
}

export interface Corretor {
  instance: string;
  email: string | null;
  is_admin: boolean;
  drive_pasta_teasers: string | null;
}

export interface AtualizarCorretorPayload {
  drive_pasta_teasers?: string;
  is_admin?: boolean;
}

export interface QrCodeResultado {
  conectado: boolean;
  qrcode_base64: string | null;
}

export interface VerificarClienteResultado {
  existe: boolean | null;
  erro: string | null;
}

export interface NovoCorretorPayload {
  instance: string;
  nome_corretor: string;
  email: string;
  senha: string;
  whatsapp_numero: string;
  crm_login: string;
  crm_senha: string;
  drive_pasta_teasers?: string;
}

export interface NovoCorretorResultado {
  ok: true;
  instance: string;
  painel: 'criado';
  praedium: 'criado' | 'falhou';
  praedium_erro: string | null;
  evolution: 'criado' | 'falhou';
  evolution_erro: string | null;
  qrcode_base64: string | null;
}

export interface VincularAcessoPayload {
  instance: string;
  email: string;
  senha: string;
  is_admin?: boolean;
  drive_pasta_teasers?: string;
}

export type ConviteStatus = 'pendente' | 'preenchido' | 'finalizado';

export interface Convite {
  id: number;
  token: string;
  url: string;
  status: ConviteStatus;
  nome_corretor: string | null;
  whatsapp_numero: string | null;
  email: string | null;
  crm_login: string | null;
  drive_pasta_teasers: string | null;
  criado_em: string;
  preenchido_em: string | null;
}

export interface PreencherConvitePayload {
  nome_corretor: string;
  whatsapp_numero: string;
  email: string;
  senha: string;
  crm_login: string;
  crm_senha: string;
  drive_pasta_teasers?: string;
}
