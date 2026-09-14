import { describe, it, expect, vi, beforeEach } from 'vitest';
import request from 'supertest';

// Mocka o cliente Supabase inteiro -- este teste existe pra proteger
// especificamente o isolamento por instance do callback de status de
// campanha (PATCH /api/campanhas/:id/status). Sem isso, qualquer chamador
// com o x-webhook-secret conseguiria atualizar a campanha de outro corretor
// so adivinhando o id.
let mockResponse;
let eqChamadas;

vi.mock('@supabase/supabase-js', () => {
  const chain = {
    eq(...args) {
      eqChamadas.push(args);
      return chain;
    },
    update() {
      return chain;
    },
    select() {
      return chain;
    },
    then(resolve) {
      resolve(mockResponse);
    },
  };
  return {
    createClient: () => ({
      auth: { getUser: vi.fn() },
      from: () => chain,
    }),
  };
});

process.env.SUPABASE_URL = 'http://localhost.test';
process.env.SUPABASE_SERVICE_ROLE_KEY = 'chave-teste';
process.env.N8N_WEBHOOK_SECRET = 'segredo-teste';

const { app } = await import('./app.js');

beforeEach(() => {
  eqChamadas = [];
  mockResponse = { data: null, error: null, count: 1 };
});

describe('PATCH /api/campanhas/:id/status', () => {
  it('rejeita sem o segredo do webhook', async () => {
    const res = await request(app)
      .patch('/api/campanhas/1/status')
      .send({ status: 'enviada', instance: 'renan' });
    expect(res.status).toBe(401);
  });

  it('rejeita com o segredo errado', async () => {
    const res = await request(app)
      .patch('/api/campanhas/1/status')
      .set('x-webhook-secret', 'segredo-errado')
      .send({ status: 'enviada', instance: 'renan' });
    expect(res.status).toBe(401);
  });

  it('rejeita sem instance no corpo', async () => {
    const res = await request(app)
      .patch('/api/campanhas/1/status')
      .set('x-webhook-secret', 'segredo-teste')
      .send({ status: 'enviada' });
    expect(res.status).toBe(400);
  });

  it('rejeita status invalido', async () => {
    const res = await request(app)
      .patch('/api/campanhas/1/status')
      .set('x-webhook-secret', 'segredo-teste')
      .send({ status: 'qualquercoisa', instance: 'renan' });
    expect(res.status).toBe(400);
  });

  it('filtra o update por instance (isolamento entre corretores)', async () => {
    const res = await request(app)
      .patch('/api/campanhas/1/status')
      .set('x-webhook-secret', 'segredo-teste')
      .send({ status: 'enviada', instance: 'renan' });
    expect(res.status).toBe(200);
    expect(eqChamadas).toContainEqual(['id', '1']);
    expect(eqChamadas).toContainEqual(['instance', 'renan']);
  });

  it('devolve 404 quando a campanha nao pertence aquela instance', async () => {
    mockResponse = { data: null, error: null, count: 0 };
    const res = await request(app)
      .patch('/api/campanhas/999/status')
      .set('x-webhook-secret', 'segredo-teste')
      .send({ status: 'enviada', instance: 'outro-corretor' });
    expect(res.status).toBe(404);
  });
});
