import { describe, it, expect, vi, beforeEach } from 'vitest';
import request from 'supertest';

// Validade dos convites: link nao preenchido vale 7 dias; convite preenchido
// (guarda senhas em texto puro) vale 48h. Passou disso, as rotas recusam e a
// limpeza periodica apaga.
let conviteResposta;
let deleteChamadas;
let limpezaContagem;

vi.mock('@supabase/supabase-js', () => {
  const novaChain = () => {
    const estado = { delete: false, filtros: [] };
    const chain = {
      select() {
        return chain;
      },
      update() {
        return chain;
      },
      delete(opcoes) {
        estado.delete = true;
        estado.opcoes = opcoes;
        return chain;
      },
      eq(coluna, valor) {
        estado.filtros.push(['eq', coluna, valor]);
        return chain;
      },
      lt(coluna, valor) {
        estado.filtros.push(['lt', coluna, valor]);
        return chain;
      },
      maybeSingle() {
        return Promise.resolve(conviteResposta);
      },
      then(resolve) {
        if (estado.delete) {
          deleteChamadas.push(estado.filtros);
          const status = estado.filtros.find(([, c]) => c === 'status')?.[2];
          resolve({ error: null, count: limpezaContagem[status] ?? 0 });
        } else {
          resolve({ error: null, data: null });
        }
      },
    };
    return chain;
  };
  return {
    createClient: () => ({
      auth: { getUser: vi.fn() },
      from: () => novaChain(),
    }),
  };
});

process.env.SUPABASE_URL = 'http://localhost.test';
process.env.SUPABASE_SERVICE_ROLE_KEY = 'chave-teste';
process.env.N8N_WEBHOOK_SECRET = 'segredo-teste';

const {
  app,
  conviteExpirado,
  conviteExpiraEm,
  limparConvitesExpirados,
  CONVITE_PENDENTE_VALIDADE_MS,
  CONVITE_PREENCHIDO_VALIDADE_MS,
} = await import('./app.js');

const HORA = 60 * 60 * 1000;
const DIA = 24 * HORA;
const AGORA = Date.parse('2026-09-19T12:00:00.000Z');
const atras = (ms) => new Date(AGORA - ms).toISOString();

beforeEach(() => {
  deleteChamadas = [];
  limpezaContagem = {};
  conviteResposta = { data: null, error: null };
});

describe('conviteExpirado', () => {
  it('as validades sao 7 dias (pendente) e 48h (preenchido)', () => {
    expect(CONVITE_PENDENTE_VALIDADE_MS).toBe(7 * DIA);
    expect(CONVITE_PREENCHIDO_VALIDADE_MS).toBe(48 * HORA);
  });

  it('link pendente: vale ate 7 dias, expira depois', () => {
    expect(conviteExpirado({ status: 'pendente', criado_em: atras(6 * DIA) }, AGORA)).toBe(false);
    expect(conviteExpirado({ status: 'pendente', criado_em: atras(7 * DIA + 1000) }, AGORA)).toBe(true);
  });

  it('convite preenchido: vale ate 48h contadas do preenchimento, nao da criacao', () => {
    const criadoHaCincoDias = atras(5 * DIA);
    expect(conviteExpirado({ status: 'preenchido', criado_em: criadoHaCincoDias, preenchido_em: atras(47 * HORA) }, AGORA)).toBe(false);
    expect(conviteExpirado({ status: 'preenchido', criado_em: criadoHaCincoDias, preenchido_em: atras(49 * HORA) }, AGORA)).toBe(true);
  });

  it('preenchido sem preenchido_em usa a data de criacao', () => {
    expect(conviteExpirado({ status: 'preenchido', criado_em: atras(3 * DIA), preenchido_em: null }, AGORA)).toBe(true);
  });

  it('sem nenhuma data valida nao expira por engano', () => {
    expect(conviteExpirado({ status: 'pendente', criado_em: null }, AGORA)).toBe(false);
  });
});

describe('conviteExpiraEm', () => {
  it('devolve a data limite de acordo com o status', () => {
    const criado = atras(1 * DIA);
    expect(conviteExpiraEm({ status: 'pendente', criado_em: criado })).toBe(
      new Date(Date.parse(criado) + 7 * DIA).toISOString(),
    );
    const preenchido = atras(1 * HORA);
    expect(conviteExpiraEm({ status: 'preenchido', criado_em: criado, preenchido_em: preenchido })).toBe(
      new Date(Date.parse(preenchido) + 48 * HORA).toISOString(),
    );
  });
});

describe('GET /api/convites/:token (publico)', () => {
  it('aceita link pendente dentro do prazo', async () => {
    conviteResposta = { data: { status: 'pendente', criado_em: new Date().toISOString(), preenchido_em: null }, error: null };
    const res = await request(app).get('/api/convites/abc');
    expect(res.status).toBe(200);
  });

  it('recusa link pendente vencido (mais de 7 dias)', async () => {
    conviteResposta = { data: { status: 'pendente', criado_em: new Date(Date.now() - 8 * DIA).toISOString(), preenchido_em: null }, error: null };
    const res = await request(app).get('/api/convites/abc');
    expect(res.status).toBe(404);
  });
});

describe('POST /api/convites/:token (publico)', () => {
  const corpo = {
    nome_corretor: 'Fulano',
    whatsapp_numero: '5513999999999',
    email: 'fulano@teste.com',
    senha: 'senha123',
    crm_login: 'fulano',
    crm_senha: 'crm123',
  };

  it('recusa preencher um link vencido', async () => {
    conviteResposta = { data: { id: 1, status: 'pendente', criado_em: new Date(Date.now() - 8 * DIA).toISOString(), preenchido_em: null }, error: null };
    const res = await request(app).post('/api/convites/abc').send(corpo);
    expect(res.status).toBe(404);
  });
});

describe('limparConvitesExpirados', () => {
  it('apaga pendentes com mais de 7 dias e preenchidos com mais de 48h', async () => {
    limpezaContagem = { pendente: 2, preenchido: 1 };
    const total = await limparConvitesExpirados(AGORA);
    expect(total).toBe(3);
    expect(deleteChamadas).toHaveLength(2);
    const [pendentes, preenchidos] = deleteChamadas;
    expect(pendentes).toContainEqual(['eq', 'status', 'pendente']);
    expect(pendentes).toContainEqual(['lt', 'criado_em', atras(7 * DIA)]);
    expect(preenchidos).toContainEqual(['eq', 'status', 'preenchido']);
    expect(preenchidos).toContainEqual(['lt', 'preenchido_em', atras(48 * HORA)]);
  });

  it('nunca apaga sem filtrar por status e data (nao leva convite vigente junto)', async () => {
    await limparConvitesExpirados(AGORA);
    for (const filtros of deleteChamadas) {
      expect(filtros.some(([op]) => op === 'eq')).toBe(true);
      expect(filtros.some(([op]) => op === 'lt')).toBe(true);
    }
  });

  it('devolve 0 quando nao ha nada vencido', async () => {
    expect(await limparConvitesExpirados(AGORA)).toBe(0);
  });
});
