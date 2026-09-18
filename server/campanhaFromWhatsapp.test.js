import { describe, it, expect, vi, beforeEach } from 'vitest';
import request from 'supertest';

// Mocka o Supabase com uma fila de respostas -- este endpoint faz duas
// chamadas em sequencia (contarDestinatarios, depois o insert), entao cada
// teste empilha as respostas na ordem que devem ser consumidas.
let respostas;

function proximaResposta() {
  return respostas.length ? respostas.shift() : { data: null, error: null, count: 0 };
}

vi.mock('@supabase/supabase-js', () => {
  const chain = {
    eq() {
      return chain;
    },
    neq() {
      return chain;
    },
    gte() {
      return chain;
    },
    in() {
      return chain;
    },
    select() {
      return chain;
    },
    insert() {
      return chain;
    },
    single() {
      return Promise.resolve(proximaResposta());
    },
    then(resolve) {
      resolve(proximaResposta());
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

const corpoValido = {
  instance: 'renan',
  mensagens: ['Oi [nome]!'],
  destinatarios_modo: 'todos',
  agendamento_data: new Date(Date.now() + 3600_000).toISOString(),
};

beforeEach(() => {
  respostas = [];
});

describe('POST /api/campanhas/from-whatsapp', () => {
  it('rejeita sem o segredo do webhook', async () => {
    const res = await request(app).post('/api/campanhas/from-whatsapp').send(corpoValido);
    expect(res.status).toBe(401);
  });

  it('rejeita sem mensagens', async () => {
    const res = await request(app)
      .post('/api/campanhas/from-whatsapp')
      .set('x-webhook-secret', 'segredo-teste')
      .send({ ...corpoValido, mensagens: [] });
    expect(res.status).toBe(400);
  });

  it('rejeita modo etapa sem etapa informada', async () => {
    const res = await request(app)
      .post('/api/campanhas/from-whatsapp')
      .set('x-webhook-secret', 'segredo-teste')
      .send({ ...corpoValido, destinatarios_modo: 'etapa' });
    expect(res.status).toBe(400);
  });

  it('rejeita data no passado', async () => {
    const res = await request(app)
      .post('/api/campanhas/from-whatsapp')
      .set('x-webhook-secret', 'segredo-teste')
      .send({ ...corpoValido, agendamento_data: new Date(Date.now() - 3600_000).toISOString() });
    expect(res.status).toBe(400);
  });

  it('rejeita quando o limite diario de campanhas ja foi atingido', async () => {
    respostas.push({ data: null, error: null, count: 5 });
    const res = await request(app)
      .post('/api/campanhas/from-whatsapp')
      .set('x-webhook-secret', 'segredo-teste')
      .send(corpoValido);
    expect(res.status).toBe(429);
  });

  it('rejeita quando ha outra campanha pendente a menos de 5 minutos', async () => {
    respostas.push({ data: null, error: null, count: 0 });
    respostas.push({
      data: [{ nome: 'Outra', agendamento_tipo: 'agendado', agendamento_data: corpoValido.agendamento_data, created_at: new Date().toISOString() }],
      error: null,
    });
    const res = await request(app)
      .post('/api/campanhas/from-whatsapp')
      .set('x-webhook-secret', 'segredo-teste')
      .send(corpoValido);
    expect(res.status).toBe(400);
    expect(res.body.error).toMatch(/5 minutos/);
  });

  it('rejeita quando nao ha nenhum destinatario', async () => {
    respostas.push({ data: null, error: null, count: 0 });
    respostas.push({ data: [], error: null });
    respostas.push({ data: null, error: null, count: 0 });
    const res = await request(app)
      .post('/api/campanhas/from-whatsapp')
      .set('x-webhook-secret', 'segredo-teste')
      .send(corpoValido);
    expect(res.status).toBe(400);
  });

  it('cria a campanha agendada quando tudo esta valido', async () => {
    respostas.push({ data: null, error: null, count: 0 });
    respostas.push({ data: [], error: null });
    respostas.push({ data: null, error: null, count: 3 });
    respostas.push({
      data: { id: 42, status: 'agendada', destinatarios_count: 3, agendamento_data: corpoValido.agendamento_data },
      error: null,
    });
    const res = await request(app)
      .post('/api/campanhas/from-whatsapp')
      .set('x-webhook-secret', 'segredo-teste')
      .send(corpoValido);
    expect(res.status).toBe(201);
    expect(res.body.data.id).toBe(42);
  });
});
