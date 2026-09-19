import { describe, it, expect, vi, beforeEach } from 'vitest';
import request from 'supertest';

// Cobre requireAuth/requireAdmin (sessao Supabase -> perfil do corretor) e o
// isolamento por instance no cancelamento de campanha (DELETE /api/campanhas/:id).
let getUserResposta;
let perfilResposta;
let campanhaResposta;
let eqChamadas;

vi.mock('@supabase/supabase-js', () => {
  const chainDe = (tabela) => {
    const chain = {
      eq(...args) {
        eqChamadas.push([tabela, ...args]);
        return chain;
      },
      select() {
        return chain;
      },
      update() {
        return chain;
      },
      maybeSingle() {
        return Promise.resolve(perfilResposta);
      },
      single() {
        return Promise.resolve(campanhaResposta);
      },
      then(resolve) {
        resolve({ data: null, error: null });
      },
    };
    return chain;
  };
  return {
    createClient: () => ({
      auth: { getUser: () => Promise.resolve(getUserResposta) },
      from: (tabela) => chainDe(tabela),
    }),
  };
});

process.env.SUPABASE_URL = 'http://localhost.test';
process.env.SUPABASE_SERVICE_ROLE_KEY = 'chave-teste';
process.env.N8N_WEBHOOK_SECRET = 'segredo-teste';

const { app } = await import('./app.js');

beforeEach(() => {
  eqChamadas = [];
  getUserResposta = { data: { user: { id: 'user-1' } }, error: null };
  perfilResposta = { data: { instance: 'renan', drive_pasta_teasers: 'pasta', is_admin: false }, error: null };
  campanhaResposta = { data: { status: 'agendada' }, error: null };
});

describe('requireAuth', () => {
  it('rejeita sem o header Authorization', async () => {
    const res = await request(app).get('/api/me');
    expect(res.status).toBe(401);
  });

  it('rejeita header que nao e Bearer', async () => {
    const res = await request(app).get('/api/me').set('Authorization', 'Basic abc');
    expect(res.status).toBe(401);
  });

  it('rejeita sessao invalida ou expirada', async () => {
    getUserResposta = { data: { user: null }, error: { message: 'jwt expired' } };
    const res = await request(app).get('/api/me').set('Authorization', 'Bearer token-ruim');
    expect(res.status).toBe(401);
  });

  it('devolve 403 quando a conta nao esta vinculada a um corretor', async () => {
    perfilResposta = { data: null, error: null };
    const res = await request(app).get('/api/me').set('Authorization', 'Bearer token-ok');
    expect(res.status).toBe(403);
  });

  it('aceita sessao valida com perfil vinculado', async () => {
    const res = await request(app).get('/api/me').set('Authorization', 'Bearer token-ok');
    expect(res.status).toBe(200);
  });
});

describe('requireAdmin', () => {
  it('bloqueia corretor comum em rota de admin', async () => {
    const res = await request(app).get('/api/admin/convites').set('Authorization', 'Bearer token-ok');
    expect(res.status).toBe(403);
  });
});

describe('DELETE /api/campanhas/:id', () => {
  it('filtra o update de cancelamento por instance do corretor logado', async () => {
    const res = await request(app).delete('/api/campanhas/7').set('Authorization', 'Bearer token-ok');
    expect(res.status).toBe(200);
    const eqsUpdate = eqChamadas.filter(([tabela]) => tabela === 'campanhas');
    // 2 filtros na busca (id + instance) e 2 no update (id + instance)
    expect(eqsUpdate.filter(([, coluna, valor]) => coluna === 'instance' && valor === 'renan')).toHaveLength(2);
  });

  it('nao cancela campanha que nao pertence ao corretor', async () => {
    campanhaResposta = { data: null, error: { message: 'no rows' } };
    const res = await request(app).delete('/api/campanhas/7').set('Authorization', 'Bearer token-ok');
    expect(res.status).toBe(404);
  });

  it('nao cancela campanha ja enviada', async () => {
    campanhaResposta = { data: { status: 'enviada' }, error: null };
    const res = await request(app).delete('/api/campanhas/7').set('Authorization', 'Bearer token-ok');
    expect(res.status).toBe(400);
  });
});
