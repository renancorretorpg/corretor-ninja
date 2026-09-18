import { describe, it, expect, vi } from 'vitest';

vi.mock('@supabase/supabase-js', () => ({
  createClient: () => ({ auth: { getUser: vi.fn() }, from: () => ({}) }),
}));

process.env.SUPABASE_URL = 'http://localhost.test';
process.env.SUPABASE_SERVICE_ROLE_KEY = 'chave-teste';
process.env.N8N_WEBHOOK_SECRET = 'segredo-teste';

const { normalizarMensagem } = await import('./app.js');

describe('normalizarMensagem', () => {
  it('corrige espacos dentro do placeholder', () => {
    expect(normalizarMensagem('Oi [nome ] !')).toBe('Oi [nome] !');
    expect(normalizarMensagem('Ola [ nome]!')).toBe('Ola [nome]!');
  });

  it('ignora maiusculas e corrige varias ocorrencias', () => {
    expect(normalizarMensagem('[ NOME ], tudo bem? [Nome ]')).toBe('[nome], tudo bem? [nome]');
  });

  it('mantem o que ja esta certo e apara as pontas', () => {
    expect(normalizarMensagem('  Oi [nome]!  ')).toBe('Oi [nome]!');
  });

  it('nao mexe em outros colchetes', () => {
    expect(normalizarMensagem('Veja [foto] do imovel')).toBe('Veja [foto] do imovel');
  });
});
