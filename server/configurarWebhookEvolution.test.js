import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

vi.mock('@supabase/supabase-js', () => ({
  createClient: () => ({ auth: { getUser: vi.fn() }, from: () => ({}) }),
}));

process.env.SUPABASE_URL = 'http://localhost.test';
process.env.SUPABASE_SERVICE_ROLE_KEY = 'chave-teste';
process.env.N8N_WEBHOOK_SECRET = 'segredo-teste';
process.env.EVOLUTION_API_URL = 'http://evolution.test';
process.env.EVOLUTION_API_GLOBAL_KEY = 'global-teste';

const { configurarWebhookEvolution } = await import('./app.js');

const URL_ESPERADA = 'https://n8n.secretariadocorretor.shop/webhook/agente-whatsapp';

function resposta(status, corpo) {
  return { ok: status >= 200 && status < 300, status, json: async () => corpo };
}

let chamadas;
function mockFetch(...respostas) {
  chamadas = [];
  vi.stubGlobal('fetch', vi.fn(async (url, opts) => {
    chamadas.push({ url, opts });
    return respostas.shift();
  }));
}

beforeEach(() => {
  chamadas = [];
});
afterEach(() => {
  vi.unstubAllGlobals();
});

describe('configurarWebhookEvolution', () => {
  it('configura o webhook e confere o que ficou gravado', async () => {
    mockFetch(resposta(201, {}), resposta(200, { enabled: true, url: URL_ESPERADA }));
    const r = await configurarWebhookEvolution('jefferson');
    expect(r.ok).toBe(true);

    const [set, find] = chamadas;
    expect(set.url).toBe('http://evolution.test/webhook/set/jefferson');
    expect(set.opts.headers.apikey).toBe('global-teste');
    const corpo = JSON.parse(set.opts.body);
    expect(corpo.webhook.url).toBe(URL_ESPERADA);
    expect(corpo.webhook.base64).toBe(true);
    expect(corpo.webhook.events).toEqual(['MESSAGES_UPSERT']);
    expect(corpo.url).toBe(URL_ESPERADA);
    expect(find.url).toBe('http://evolution.test/webhook/find/jefferson');
  });

  it('codifica o nome da instancia na URL', async () => {
    mockFetch(resposta(201, {}), resposta(200, { webhook: { enabled: true, url: URL_ESPERADA } }));
    await configurarWebhookEvolution('a b');
    expect(chamadas[0].url).toBe('http://evolution.test/webhook/set/a%20b');
  });

  it('falha com a mensagem do Evolution quando o set e recusado', async () => {
    mockFetch(resposta(400, { response: { message: ['url invalida'] } }));
    const r = await configurarWebhookEvolution('jefferson');
    expect(r.ok).toBe(false);
    expect(r.erro).toBe('url invalida');
  });

  it('falha quando o Evolution grava outra URL', async () => {
    mockFetch(resposta(201, {}), resposta(200, { enabled: true, url: 'https://outro.exemplo/x' }));
    const r = await configurarWebhookEvolution('jefferson');
    expect(r.ok).toBe(false);
    expect(r.erro).toMatch(/não gravou/);
  });

  it('falha quando o Evolution deixa o webhook desligado', async () => {
    mockFetch(resposta(201, {}), resposta(200, { enabled: false, url: URL_ESPERADA }));
    const r = await configurarWebhookEvolution('jefferson');
    expect(r.ok).toBe(false);
  });

  it('nao derruba o cadastro em erro de rede', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => {
      throw new Error('ECONNREFUSED');
    }));
    const r = await configurarWebhookEvolution('jefferson');
    expect(r).toEqual({ ok: false, erro: 'ECONNREFUSED' });
  });
});
