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

export function statusTone(status: string): 'default' | 'success' | 'warning' | 'muted' {
  const s = status.toLowerCase();
  if (s === 'novo') return 'default';
  if (s === 'enviado') return 'success';
  if (s === 'inativo' || s === 'perdido') return 'muted';
  return 'warning';
}
