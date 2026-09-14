import { describe, it, expect } from 'vitest';
import { sanitizarTermoBusca } from './app.js';

// sanitizarTermoBusca protege o .or() de busca em /api/leads (ver app.js) de
// um termo malicioso fechando a condicao ilike e anexando clausulas extras
// no filtro do PostgREST.
describe('sanitizarTermoBusca', () => {
  it('mantem um termo de busca normal intacto', () => {
    expect(sanitizarTermoBusca('Renan Nascimento')).toBe('Renan Nascimento');
    expect(sanitizarTermoBusca('5513996113172')).toBe('5513996113172');
  });

  it('remove virgula, parenteses e aspas', () => {
    expect(sanitizarTermoBusca('a,b')).toBe('ab');
    expect(sanitizarTermoBusca('a(b)')).toBe('ab');
    expect(sanitizarTermoBusca('a"b')).toBe('ab');
  });

  it('neutraliza uma tentativa de injetar clausula extra no filtro', () => {
    const malicioso = 'x),status.eq.qualquercoisa,nome.ilike.%(y';
    const limpo = sanitizarTermoBusca(malicioso);
    expect(limpo).not.toContain(',');
    expect(limpo).not.toContain('(');
    expect(limpo).not.toContain(')');
  });
});
