export function formatTelefone(numero: string): string {
  // remove codigo do pais (55) se presente e formata (DD) 9XXXX-XXXX
  const digits = numero.replace(/\D/g, '');
  const semPais = digits.startsWith('55') && digits.length > 11 ? digits.slice(2) : digits;
  if (semPais.length === 11) {
    return `(${semPais.slice(0, 2)}) ${semPais.slice(2, 7)}-${semPais.slice(7)}`;
  }
  if (semPais.length === 10) {
    return `(${semPais.slice(0, 2)}) ${semPais.slice(2, 6)}-${semPais.slice(6)}`;
  }
  return numero;
}

// Mesma regra do backend: 10 a 13 digitos (DDD + numero, com ou sem DDI 55).
export function telefoneValido(numero: string): boolean {
  const digits = numero.replace(/\D/g, '');
  return digits.length >= 10 && digits.length <= 13;
}

export const MSG_TELEFONE_INVALIDO = 'Telefone inválido. Use DDD + número (10 a 13 dígitos).';

export function formatData(iso: string): string {
  const d = new Date(iso);
  return d.toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit', year: 'numeric' });
}

export function formatDataHora(iso: string): string {
  const d = new Date(iso);
  return d.toLocaleString('pt-BR', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
}

const FORMATADOR_DIA_SP = new Intl.DateTimeFormat('en-CA', {
  timeZone: 'America/Sao_Paulo',
  year: 'numeric',
  month: '2-digit',
  day: '2-digit',
});

// Compara duas datas ISO pelo dia no fuso de Sao Paulo -- usado pra saber se
// uma campanha ja foi criada "hoje" (mesma regra do limite de 1/dia no
// backend, que usa o mesmo formatador pra ficar consistente).
export function mesmoDiaSaoPaulo(isoA: string, isoB: string): boolean {
  return FORMATADOR_DIA_SP.format(new Date(isoA)) === FORMATADOR_DIA_SP.format(new Date(isoB));
}

export function statusTone(status: string): 'default' | 'success' | 'warning' | 'muted' {
  const s = status.toLowerCase();
  if (s === 'novo') return 'default';
  if (s === 'enviado') return 'success';
  if (s === 'inativo' || s === 'perdido') return 'muted';
  return 'warning';
}
