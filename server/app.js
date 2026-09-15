import 'dotenv/config';
import crypto from 'node:crypto';
import express from 'express';
import cors from 'cors';
import rateLimit from 'express-rate-limit';
import { createClient } from '@supabase/supabase-js';

const {
  SUPABASE_URL,
  SUPABASE_SERVICE_ROLE_KEY,
  GOOGLE_DRIVE_API_KEY,
  N8N_DISPARO_WEBHOOK_URL,
  N8N_COPIAR_IMAGENS_WEBHOOK_URL,
  N8N_CANCELAR_WEBHOOK_URL,
  N8N_ADICIONAR_IMAGEM_WEBHOOK_URL,
  N8N_CRIAR_CLIENTE_WEBHOOK_URL,
  N8N_VERIFICAR_CLIENTE_WEBHOOK_URL,
  N8N_WEBHOOK_SECRET,
  PANEL_PUBLIC_URL,
  EVOLUTION_API_URL,
  EVOLUTION_API_GLOBAL_KEY,
} = process.env;

if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) {
  console.error('Faltando SUPABASE_URL ou SUPABASE_SERVICE_ROLE_KEY no .env');
  process.exit(1);
}
if (!N8N_WEBHOOK_SECRET) {
  console.error('Faltando N8N_WEBHOOK_SECRET no .env — sem ele o callback de status de campanha fica sem proteção.');
  process.exit(1);
}

const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, {
  auth: { persistSession: false },
});

const app = express();
// Atras do proxy do EasyPanel -- sem isso, req.ip seria sempre o IP interno
// do proxy e o rate limit ficaria inutil (todo mundo cairia no mesmo bucket).
app.set('trust proxy', 1);
// So aceita o dominio publico do painel + origens locais (dev/teste). Em
// producao o front e servido pelo mesmo Express (bloco NODE_ENV abaixo), entao
// o navegador nem faz requisicao cross-origin de verdade -- essa restricao e'
// defesa em profundidade contra chamadas de outros dominios usando um token
// roubado, nao algo que o uso normal dependa de passar.
const origensPermitidas = [PANEL_PUBLIC_URL, 'http://localhost:5173', 'http://127.0.0.1:5173'].filter(Boolean);
app.use(cors({
  origin(origin, callback) {
    if (!origin || origensPermitidas.includes(origin)) return callback(null, true);
    callback(new Error('Origem não permitida.'));
  },
}));
// Limite maior que o default (100kb) por causa do upload de imagens em base64
// na criacao/edicao de campanhas.
app.use(express.json({ limit: '15mb' }));

// Rate limit generoso (o uso real e' poucos corretores com polling via
// react-query) so pra barrar abuso/scan, nao pra throttlar uso normal.
app.use('/api', rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: 600,
  standardHeaders: true,
  legacyHeaders: false,
}));

// Valida a sessao Supabase (Authorization: Bearer <token>) e resolve qual
// corretor ela e via corretor_perfis. Mesmo padrao do painel antigo hospedado
// no n8n (getUser contra o Auth do Supabase + lookup por user_id).
async function requireAuth(req, res, next) {
  const authHeader = req.headers.authorization || '';
  const token = authHeader.startsWith('Bearer ') ? authHeader.slice(7) : null;
  if (!token) {
    return res.status(401).json({ error: 'Não autenticado.' });
  }
  const { data: userData, error: userError } = await supabase.auth.getUser(token);
  if (userError || !userData?.user) {
    return res.status(401).json({ error: 'Sessão inválida ou expirada.' });
  }
  const { data: perfil, error: perfilError } = await supabase
    .from('corretor_perfis')
    .select('instance, drive_pasta_teasers, is_admin')
    .eq('user_id', userData.user.id)
    .maybeSingle();
  if (perfilError || !perfil) {
    return res.status(403).json({ error: 'Conta não vinculada a nenhum corretor.' });
  }
  req.instance = perfil.instance;
  req.driveFolder = perfil.drive_pasta_teasers;
  req.isAdmin = perfil.is_admin === true;
  req.user = userData.user;
  next();
}

// Usar sempre depois de requireAuth (precisa de req.isAdmin ja resolvido).
function requireAdmin(req, res, next) {
  if (!req.isAdmin) {
    return res.status(403).json({ error: 'Acesso restrito a administradores.' });
  }
  next();
}

const ALLOWED_SORT_COLUMNS = new Set(['nome', 'status', 'origem', 'created_at', 'updated_at']);

// Tira caracteres com significado especial na gramatica de filtro do
// PostgREST (`,` separa condicoes, `(` `)` agrupam, `"` abre valor
// entre aspas) antes de embutir o termo de busca num .or() com template
// string -- sem isso, um termo malicioso poderia fechar a condicao
// ilike e anexar clausulas extras no filtro.
function sanitizarTermoBusca(term) {
  return term.replace(/[,()"]/g, '');
}

// GET /api/leads?page=1&pageSize=25&status=&origem=&search=&sortBy=created_at&sortDir=desc
app.get('/api/leads', requireAuth, async (req, res) => {
  try {
    const page = Math.max(1, parseInt(req.query.page, 10) || 1);
    const pageSize = Math.min(100, Math.max(1, parseInt(req.query.pageSize, 10) || 25));
    const sortBy = ALLOWED_SORT_COLUMNS.has(req.query.sortBy) ? req.query.sortBy : 'created_at';
    const sortDir = req.query.sortDir === 'asc' ? true : false;

    let query = supabase
      .from('leads')
      .select('*', { count: 'exact' })
      .eq('instance', req.instance);

    if (req.query.status) {
      query = query.eq('status', req.query.status);
    }
    if (req.query.origem) {
      query = query.eq('origem', req.query.origem);
    }
    if (req.query.search) {
      const term = sanitizarTermoBusca(req.query.search.trim());
      if (term) query = query.or(`nome.ilike.%${term}%,numero.ilike.%${term}%`);
    }

    const from = (page - 1) * pageSize;
    const to = from + pageSize - 1;
    query = query.order(sortBy, { ascending: sortDir }).range(from, to);

    const { data, error, count } = await query;
    if (error) throw error;

    res.json({ data, total: count ?? 0, page, pageSize });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Erro interno. Tente novamente em instantes.' });
  }
});

// GET /api/leads/statuses — distinct status values presentes na base (etapas ainda nao tem tabela propria)
app.get('/api/leads/statuses', requireAuth, async (req, res) => {
  try {
    const { data, error } = await supabase
      .from('leads')
      .select('status')
      .eq('instance', req.instance);
    if (error) throw error;
    const statuses = Array.from(new Set(data.map((r) => r.status).filter(Boolean)));
    res.json({ statuses });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Erro interno. Tente novamente em instantes.' });
  }
});

// GET /api/leads/origens — distinct origem values, para o filtro
app.get('/api/leads/origens', requireAuth, async (req, res) => {
  try {
    const { data, error } = await supabase
      .from('leads')
      .select('origem')
      .eq('instance', req.instance);
    if (error) throw error;
    const origens = Array.from(new Set(data.map((r) => r.origem).filter(Boolean)));
    res.json({ origens });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Erro interno. Tente novamente em instantes.' });
  }
});

// PATCH /api/leads/:id — usado pelo Kanban (mudar status) e edicao pontual
app.patch('/api/leads/:id', requireAuth, async (req, res) => {
  try {
    const { id } = req.params;
    const allowedFields = ['status', 'notas', 'nome', 'sobrenome', 'origem'];
    const updates = {};
    for (const field of allowedFields) {
      if (req.body[field] !== undefined) updates[field] = req.body[field];
    }
    if (Object.keys(updates).length === 0) {
      return res.status(400).json({ error: 'Nenhum campo válido para atualizar.' });
    }

    // So valida contra a lista de etapas se ela ja existir -- numa conta nova
    // (antes do primeiro GET /api/etapas semear a partir dos status em uso)
    // a tabela pode estar vazia, e nesse caso nao ha nada pra validar contra.
    if (updates.status !== undefined) {
      const { count, error: etapasError } = await supabase
        .from('etapas')
        .select('*', { count: 'exact', head: true })
        .eq('instance', req.instance);
      if (etapasError) throw etapasError;
      if ((count ?? 0) > 0) {
        const { data: etapaExistente, error: checkError } = await supabase
          .from('etapas')
          .select('id')
          .eq('instance', req.instance)
          .eq('nome', updates.status)
          .maybeSingle();
        if (checkError) throw checkError;
        if (!etapaExistente) {
          return res.status(400).json({ error: `Etapa "${updates.status}" não existe.` });
        }
      }
    }

    updates.updated_at = new Date().toISOString();

    const { data, error } = await supabase
      .from('leads')
      .update(updates)
      .eq('id', id)
      .eq('instance', req.instance)
      .select()
      .single();
    if (error) throw error;

    res.json({ data });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Erro interno. Tente novamente em instantes.' });
  }
});

// DELETE /api/leads/:id — exclui o lead (confirmado no frontend antes de chamar)
app.delete('/api/leads/:id', requireAuth, async (req, res) => {
  try {
    const { id } = req.params;
    const { error, count } = await supabase
      .from('leads')
      .delete({ count: 'exact' })
      .eq('id', id)
      .eq('instance', req.instance);
    if (error) throw error;
    if (!count) {
      return res.status(404).json({ error: 'Lead não encontrado.' });
    }
    res.json({ ok: true });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Erro interno. Tente novamente em instantes.' });
  }
});

const MAX_ETAPAS = 30;
const PALETA_CORES = [
  '#64748b', '#3b82f6', '#f59e0b', '#8b5cf6',
  '#10b981', '#ef4444', '#06b6d4', '#ec4899',
  '#84cc16', '#f97316', '#6366f1', '#14b8a6',
];

async function contarLeadsPorStatus(instance) {
  const { data, error } = await supabase
    .from('leads')
    .select('status')
    .eq('instance', instance);
  if (error) throw error;
  const contagem = {};
  for (const row of data) {
    if (!row.status) continue;
    contagem[row.status] = (contagem[row.status] || 0) + 1;
  }
  return contagem;
}

// GET /api/etapas — lista ordenada; na primeira vez (tabela vazia), semeia
// a partir dos status ja em uso nos leads, pra nao comecar do zero vazio.
app.get('/api/etapas', requireAuth, async (req, res) => {
  try {
    let { data: etapas, error } = await supabase
      .from('etapas')
      .select('*')
      .eq('instance', req.instance)
      .order('ordem', { ascending: true });
    if (error) throw error;

    if (etapas.length === 0) {
      const contagem = await contarLeadsPorStatus(req.instance);
      const nomes = Object.keys(contagem);
      if (nomes.length > 0) {
        const novasEtapas = nomes.map((nome, i) => ({
          instance: req.instance,
          nome,
          cor: PALETA_CORES[i % PALETA_CORES.length],
          ordem: i + 1,
        }));
        const { data: inseridas, error: insertError } = await supabase
          .from('etapas')
          .insert(novasEtapas)
          .select();
        if (insertError) throw insertError;
        etapas = inseridas.sort((a, b) => a.ordem - b.ordem);
      }
    }

    const contagem = await contarLeadsPorStatus(req.instance);
    const comContagem = etapas.map((e) => ({ ...e, leadCount: contagem[e.nome] || 0 }));
    res.json({ data: comContagem });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Erro interno. Tente novamente em instantes.' });
  }
});

// POST /api/etapas — cria nova etapa (nome, cor opcional)
app.post('/api/etapas', requireAuth, async (req, res) => {
  try {
    const nome = (req.body.nome || '').trim();
    if (!nome) {
      return res.status(400).json({ error: 'Nome da etapa é obrigatório.' });
    }

    const { count, error: countError } = await supabase
      .from('etapas')
      .select('*', { count: 'exact', head: true })
      .eq('instance', req.instance);
    if (countError) throw countError;
    if ((count ?? 0) >= MAX_ETAPAS) {
      return res.status(400).json({ error: `Limite de ${MAX_ETAPAS} etapas atingido.` });
    }

    const { data: existente } = await supabase
      .from('etapas')
      .select('id')
      .eq('instance', req.instance)
      .ilike('nome', nome)
      .maybeSingle();
    if (existente) {
      return res.status(409).json({ error: 'Já existe uma etapa com esse nome.' });
    }

    const { data: maxOrdemRow } = await supabase
      .from('etapas')
      .select('ordem')
      .eq('instance', req.instance)
      .order('ordem', { ascending: false })
      .limit(1)
      .maybeSingle();
    const ordem = (maxOrdemRow?.ordem ?? 0) + 1;

    const { data, error } = await supabase
      .from('etapas')
      .insert({ instance: req.instance, nome, cor: req.body.cor || null, ordem })
      .select()
      .single();
    if (error) throw error;

    res.status(201).json({ data: { ...data, leadCount: 0 } });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Erro interno. Tente novamente em instantes.' });
  }
});

// PATCH /api/etapas/:id — edita nome/cor; renomear atualiza em cascata
// o status dos leads que estavam na etapa antiga (nao ha FK, e texto livre).
app.patch('/api/etapas/:id', requireAuth, async (req, res) => {
  try {
    const { id } = req.params;
    const { data: atual, error: fetchError } = await supabase
      .from('etapas')
      .select('*')
      .eq('id', id)
      .eq('instance', req.instance)
      .single();
    if (fetchError || !atual) {
      return res.status(404).json({ error: 'Etapa não encontrada.' });
    }

    const updates = { updated_at: new Date().toISOString() };
    const novoNome = req.body.nome !== undefined ? req.body.nome.trim() : undefined;

    if (novoNome && novoNome !== atual.nome) {
      const { data: existente } = await supabase
        .from('etapas')
        .select('id')
        .eq('instance', req.instance)
        .neq('id', id)
        .ilike('nome', novoNome)
        .maybeSingle();
      if (existente) {
        return res.status(409).json({ error: 'Já existe uma etapa com esse nome.' });
      }
      updates.nome = novoNome;
    }
    if (req.body.cor !== undefined) {
      updates.cor = req.body.cor;
    }

    const { data, error } = await supabase
      .from('etapas')
      .update(updates)
      .eq('id', id)
      .eq('instance', req.instance)
      .select()
      .single();
    if (error) throw error;

    if (updates.nome) {
      const { error: cascadeError } = await supabase
        .from('leads')
        .update({ status: updates.nome, updated_at: new Date().toISOString() })
        .eq('instance', req.instance)
        .eq('status', atual.nome);
      if (cascadeError) throw cascadeError;
    }

    res.json({ data });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Erro interno. Tente novamente em instantes.' });
  }
});

// POST /api/etapas/reorder — recebe [{id, ordem}] apos drag-and-drop
app.post('/api/etapas/reorder', requireAuth, async (req, res) => {
  try {
    const itens = req.body.itens;
    if (!Array.isArray(itens)) {
      return res.status(400).json({ error: 'Formato inválido.' });
    }
    await Promise.all(
      itens.map(({ id, ordem }) =>
        supabase.from('etapas').update({ ordem }).eq('id', id).eq('instance', req.instance),
      ),
    );
    res.json({ ok: true });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Erro interno. Tente novamente em instantes.' });
  }
});

// DELETE /api/etapas/:id?moveTo=<nome> — remove uma etapa. Se houver leads
// nela, exige moveTo (etapa destino) ou responde 409 com a contagem pro
// frontend perguntar antes de a gente perder a etapa desses leads.
app.delete('/api/etapas/:id', requireAuth, async (req, res) => {
  try {
    const { id } = req.params;
    const { data: etapa, error: fetchError } = await supabase
      .from('etapas')
      .select('*')
      .eq('id', id)
      .eq('instance', req.instance)
      .single();
    if (fetchError || !etapa) {
      return res.status(404).json({ error: 'Etapa não encontrada.' });
    }

    const { count, error: countError } = await supabase
      .from('leads')
      .select('*', { count: 'exact', head: true })
      .eq('instance', req.instance)
      .eq('status', etapa.nome);
    if (countError) throw countError;

    const moveTo = req.body?.moveTo;
    if ((count ?? 0) > 0) {
      if (!moveTo) {
        return res.status(409).json({ error: 'Etapa possui leads.', leadCount: count });
      }
      const { data: destino } = await supabase
        .from('etapas')
        .select('id')
        .eq('instance', req.instance)
        .eq('nome', moveTo)
        .maybeSingle();
      if (!destino) {
        return res.status(400).json({ error: 'Etapa de destino inválida.' });
      }
      const { error: moveError } = await supabase
        .from('leads')
        .update({ status: moveTo, updated_at: new Date().toISOString() })
        .eq('instance', req.instance)
        .eq('status', etapa.nome);
      if (moveError) throw moveError;
    }

    const { error: deleteError } = await supabase
      .from('etapas')
      .delete()
      .eq('id', id)
      .eq('instance', req.instance);
    if (deleteError) throw deleteError;

    res.json({ ok: true });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Erro interno. Tente novamente em instantes.' });
  }
});

const MIN_MENSAGENS = 3;
const MAX_IMAGENS = 4;
const INTERVALO_MIN_ENTRE_CAMPANHAS_MS = 5 * 60 * 1000;

// Meia-noite de "hoje" no fuso de Sao Paulo, em ISO -- usado pra limitar a
// 1 campanha criada por dia por corretor. Brasil nao tem mais horario de
// verao (desde 2019), entao -03:00 fixo e' seguro.
function inicioDoDiaSaoPauloISO() {
  const dataSP = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'America/Sao_Paulo',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(new Date());
  return new Date(`${dataSP}T00:00:00-03:00`).toISOString();
}

// Horario em que a campanha efetivamente dispara mensagens: agora (se
// imediata) ou a data agendada.
function horarioEfetivoCampanha(campanha) {
  if (campanha.agendamento_tipo === 'imediato' || !campanha.agendamento_data) {
    return new Date(campanha.created_at);
  }
  return new Date(campanha.agendamento_data);
}

async function contarDestinatarios({ modo, etapa, leadIds, instance }) {
  if (modo === 'todos') {
    // Exclui 'inativo' igual ao disparo real (Filtrar Alvo Específico no n8n),
    // senao a contagem do wizard fica maior que o numero real de envios.
    const { count, error } = await supabase
      .from('leads')
      .select('*', { count: 'exact', head: true })
      .eq('instance', instance)
      .neq('status', 'inativo');
    if (error) throw error;
    return count ?? 0;
  }
  if (modo === 'etapa') {
    if (!etapa) return 0;
    const { count, error } = await supabase
      .from('leads')
      .select('*', { count: 'exact', head: true })
      .eq('instance', instance)
      .eq('status', etapa);
    if (error) throw error;
    return count ?? 0;
  }
  if (modo === 'manual') {
    const ids = Array.isArray(leadIds) ? leadIds : [];
    if (ids.length === 0) return 0;
    const { count, error } = await supabase
      .from('leads')
      .select('*', { count: 'exact', head: true })
      .eq('instance', instance)
      .in('id', ids);
    if (error) throw error;
    return count ?? 0;
  }
  return 0;
}

// Igual a contarDestinatarios, mas devolve os registros (id, nome, numero)
// em vez de so a contagem -- usado na hora de montar os "alvos" do disparo real.
async function resolverDestinatariosCompletos({ modo, etapa, leadIds, instance }) {
  let query = supabase.from('leads').select('id, nome, numero').eq('instance', instance);
  if (modo === 'todos') {
    query = query.neq('status', 'inativo');
  } else if (modo === 'etapa') {
    if (!etapa) return [];
    query = query.eq('status', etapa);
  } else if (modo === 'manual') {
    const ids = Array.isArray(leadIds) ? leadIds : [];
    if (ids.length === 0) return [];
    query = query.in('id', ids);
  } else {
    return [];
  }
  const { data, error } = await query;
  if (error) throw error;
  return data || [];
}

async function fetchComTimeout(url, options, timeoutMs) {
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), timeoutMs);
  try {
    return await fetch(url, { ...options, signal: controller.signal });
  } finally {
    clearTimeout(timeoutId);
  }
}

function esperar(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

// Mesma coisa que fetchComTimeout, mas tenta de novo (com backoff curto) se
// a chamada falhar por rede/timeout ou o n8n responder 5xx -- uma instabilidade
// passageira do n8n nao pode jogar a campanha inteira direto pra 'erro'.
async function fetchComTimeoutERetry(url, options, timeoutMs, tentativas = 3) {
  let ultimoErro;
  for (let tentativa = 1; tentativa <= tentativas; tentativa++) {
    try {
      const resp = await fetchComTimeout(url, options, timeoutMs);
      if (resp.ok || resp.status < 500) return resp;
      ultimoErro = new Error(`n8n respondeu ${resp.status}`);
    } catch (err) {
      ultimoErro = err;
    }
    if (tentativa < tentativas) await esperar(1000 * 2 ** (tentativa - 1));
  }
  throw ultimoErro;
}

// Copia as imagens escolhidas no wizard para uma subpasta propria da campanha
// no Drive (via workflow n8n dedicado, que tem a credencial OAuth2 de escrita).
// Trava as fotos no momento da criacao: se o corretor trocar as fotos da pasta
// compartilhada via WhatsApp depois, uma campanha agendada nao e afetada.
async function copiarImagensCampanha({ campanhaId, instance, fileIds }) {
  const resp = await fetchComTimeout(N8N_COPIAR_IMAGENS_WEBHOOK_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'x-webhook-secret': N8N_WEBHOOK_SECRET },
    body: JSON.stringify({ campanha_id: campanhaId, instance, file_ids: fileIds }),
  }, 15000);
  if (!resp.ok) throw new Error(`Falha ao copiar imagens (n8n respondeu ${resp.status}).`);
  return resp.json();
}

// Aciona o disparo real via webhook n8n (workflow "Disparo de Mensagens [CORE]").
// Compartilhada entre o POST /api/campanhas (envio imediato) e o scheduler
// (campanhas agendadas).
async function dispararCampanha(campanha) {
  try {
    const destinatarios = await resolverDestinatariosCompletos({
      modo: campanha.destinatarios_modo,
      etapa: campanha.destinatarios_etapa,
      leadIds: campanha.destinatarios_lead_ids,
      instance: campanha.instance,
    });
    const alvos = campanha.destinatarios_modo === 'todos' ? [] : destinatarios.map((l) => l.numero);

    const resp = await fetchComTimeoutERetry(N8N_DISPARO_WEBHOOK_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'x-webhook-secret': N8N_WEBHOOK_SECRET },
      body: JSON.stringify({
        origem: 'painel',
        instance: campanha.instance,
        campanha_id: campanha.id,
        mensagens: campanha.mensagens,
        pasta_imagens_id: campanha.drive_pasta_campanha_id,
        alvos,
      }),
    }, 10000);
    if (!resp.ok) throw new Error(`n8n respondeu ${resp.status}`);

    await supabase.from('campanhas')
      .update({ status: 'enviando', updated_at: new Date().toISOString() })
      .eq('id', campanha.id);
  } catch (err) {
    console.error(`Falha ao disparar campanha ${campanha.id}:`, err);
    await supabase.from('campanhas')
      .update({ status: 'erro', erro_mensagem: err.message, updated_at: new Date().toISOString() })
      .eq('id', campanha.id);
  }
}

// GET /api/campanhas/imagens — lista as imagens disponiveis na pasta do Drive
// do corretor logado (drive_pasta_teasers, resolvida por requireAuth). Exige
// GOOGLE_DRIVE_API_KEY configurada; sem isso, devolve configurado:false pro
// frontend avisar sem quebrar a pagina.
app.get('/api/campanhas/imagens', requireAuth, async (req, res) => {
  if (!GOOGLE_DRIVE_API_KEY || !req.driveFolder) {
    return res.json({ configurado: false, imagens: [] });
  }
  try {
    const q = encodeURIComponent(`'${req.driveFolder}' in parents and trashed = false and mimeType contains 'image/'`);
    const url = `https://www.googleapis.com/drive/v3/files?q=${q}&fields=files(id,name)&pageSize=100&key=${GOOGLE_DRIVE_API_KEY}`;
    const driveRes = await fetch(url);
    const driveData = await driveRes.json();
    if (!driveRes.ok) throw new Error(driveData.error?.message || 'Erro ao consultar o Drive.');

    const imagens = (driveData.files || []).map((f) => ({
      id: f.id,
      nome: f.name,
      url: `https://drive.google.com/thumbnail?id=${f.id}&sz=w400`,
    }));
    res.json({ configurado: true, imagens });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Erro interno. Tente novamente em instantes.' });
  }
});

// POST /api/campanhas/imagens/upload — sobe foto(s) novas direto pra pasta do
// Drive do corretor logado (adiciona, nunca substitui as que ja estao la).
app.post('/api/campanhas/imagens/upload', requireAuth, async (req, res) => {
  try {
    const imagens = Array.isArray(req.body.imagens) ? req.body.imagens : [];
    if (!imagens.length) {
      return res.status(400).json({ error: 'Nenhuma imagem enviada.' });
    }
    if (!req.driveFolder) {
      return res.status(400).json({ error: 'Pasta de imagens não configurada pra sua conta.' });
    }

    const resp = await fetchComTimeout(N8N_ADICIONAR_IMAGEM_WEBHOOK_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'x-webhook-secret': N8N_WEBHOOK_SECRET },
      body: JSON.stringify({ instance: req.instance, folder_id: req.driveFolder, imagens }),
    }, 20000);
    if (!resp.ok) throw new Error(`Falha ao enviar imagens (n8n respondeu ${resp.status}).`);
    const { files } = await resp.json();

    const mapeadas = (files || []).map((f) => ({
      id: f.id,
      nome: f.nome,
      url: `https://drive.google.com/thumbnail?id=${f.id}&sz=w400`,
    }));
    res.json({ files: mapeadas });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Erro interno. Tente novamente em instantes.' });
  }
});

// GET /api/campanhas/destinatarios/contagem?modo=todos|etapa|manual&etapa=&ids=1,2,3
app.get('/api/campanhas/destinatarios/contagem', requireAuth, async (req, res) => {
  try {
    const modo = req.query.modo;
    const etapa = req.query.etapa;
    const leadIds = req.query.ids ? String(req.query.ids).split(',').map(Number).filter(Boolean) : [];
    const count = await contarDestinatarios({ modo, etapa, leadIds, instance: req.instance });
    res.json({ count });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Erro interno. Tente novamente em instantes.' });
  }
});

// GET /api/campanhas — historico, mais recentes primeiro
app.get('/api/campanhas', requireAuth, async (req, res) => {
  try {
    const { data, error } = await supabase
      .from('campanhas')
      .select('*')
      .eq('instance', req.instance)
      .order('created_at', { ascending: false });
    if (error) throw error;
    res.json({ data });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Erro interno. Tente novamente em instantes.' });
  }
});

// POST /api/campanhas — cria a campanha a partir do wizard
app.post('/api/campanhas', requireAuth, async (req, res) => {
  try {
    const mensagens = (req.body.mensagens || []).map((m) => String(m).trim()).filter(Boolean);
    if (mensagens.length < MIN_MENSAGENS) {
      return res.status(400).json({ error: `Cadastre pelo menos ${MIN_MENSAGENS} variantes de mensagem.` });
    }

    const imagens = Array.isArray(req.body.imagens) ? req.body.imagens : [];
    if (imagens.length > MAX_IMAGENS) {
      return res.status(400).json({ error: `Selecione no máximo ${MAX_IMAGENS} imagens.` });
    }

    const modo = req.body.destinatarios_modo;
    if (!['todos', 'etapa', 'manual'].includes(modo)) {
      return res.status(400).json({ error: 'Forma de seleção de destinatários inválida.' });
    }
    const etapa = req.body.destinatarios_etapa || null;
    const leadIds = Array.isArray(req.body.destinatarios_lead_ids) ? req.body.destinatarios_lead_ids : null;
    if (modo === 'etapa' && !etapa) {
      return res.status(400).json({ error: 'Selecione a etapa de destino.' });
    }
    if (modo === 'manual' && (!leadIds || leadIds.length === 0)) {
      return res.status(400).json({ error: 'Selecione ao menos um lead.' });
    }

    const agendamentoTipo = req.body.agendamento_tipo;
    if (!['imediato', 'agendado'].includes(agendamentoTipo)) {
      return res.status(400).json({ error: 'Tipo de agendamento inválido.' });
    }
    let agendamentoData = null;
    if (agendamentoTipo === 'agendado') {
      agendamentoData = req.body.agendamento_data;
      if (!agendamentoData || new Date(agendamentoData) <= new Date()) {
        return res.status(400).json({ error: 'Escolha uma data/hora futura para o agendamento.' });
      }
    }

    // Trava anti-banimento: no maximo 1 campanha criada por dia por
    // corretor, e nenhuma outra campanha ainda pendente pode disparar a
    // menos de 5 minutos de distancia -- evita duas remessas de mensagens
    // caindo em cima uma da outra, que e' um padrao que o WhatsApp associa
    // a spam.
    const { count: campanhasHoje, error: contagemDiaError } = await supabase
      .from('campanhas')
      .select('id', { count: 'exact', head: true })
      .eq('instance', req.instance)
      .gte('created_at', inicioDoDiaSaoPauloISO());
    if (contagemDiaError) throw contagemDiaError;
    if ((campanhasHoje || 0) >= 1) {
      return res.status(429).json({ error: 'Só é permitido criar 1 campanha por dia. Tente novamente amanhã.' });
    }

    const { data: campanhasPendentes, error: pendentesError } = await supabase
      .from('campanhas')
      .select('nome, agendamento_tipo, agendamento_data, created_at')
      .eq('instance', req.instance)
      .in('status', ['pendente_envio', 'agendada', 'enviando']);
    if (pendentesError) throw pendentesError;

    const horarioNovaCampanha = agendamentoTipo === 'imediato' ? new Date() : new Date(agendamentoData);
    const conflito = (campanhasPendentes || []).find(
      (c) => Math.abs(horarioEfetivoCampanha(c) - horarioNovaCampanha) < INTERVALO_MIN_ENTRE_CAMPANHAS_MS,
    );
    if (conflito) {
      return res.status(400).json({
        error: `Já existe uma campanha ("${conflito.nome}") com envio muito próximo desse horário. Escolha um horário com pelo menos 5 minutos de diferença, pra reduzir o risco de bloqueio no WhatsApp.`,
      });
    }

    const count = await contarDestinatarios({ modo, etapa, leadIds, instance: req.instance });
    if (count === 0) {
      return res.status(400).json({ error: 'Nenhum destinatário encontrado com essa seleção.' });
    }

    const nome = (req.body.nome || '').trim() || `Campanha ${new Date().toLocaleDateString('pt-BR')}`;
    const status = agendamentoTipo === 'imediato' ? 'pendente_envio' : 'agendada';

    const { data, error } = await supabase
      .from('campanhas')
      .insert({
        instance: req.instance,
        nome,
        mensagens,
        imagens,
        destinatarios_modo: modo,
        destinatarios_etapa: etapa,
        destinatarios_lead_ids: leadIds,
        destinatarios_count: count,
        agendamento_tipo: agendamentoTipo,
        agendamento_data: agendamentoData,
        status,
      })
      .select()
      .single();
    if (error) throw error;

    // Trava as fotos escolhidas numa subpasta propria da campanha (nao afeta
    // a pasta compartilhada usada pelo fluxo de WhatsApp), e ja dispara na
    // hora se for imediato. Se a copia falhar, a campanha fica com status
    // 'erro' em vez de sumir, pra ficar visivel no historico.
    try {
      const { folder_id, files } = await copiarImagensCampanha({
        campanhaId: data.id,
        instance: req.instance,
        fileIds: imagens.map((i) => i.id),
      });
      const imagensAtualizadas = files.map((f) => ({
        id: f.id,
        nome: f.nome,
        url: `https://drive.google.com/thumbnail?id=${f.id}&sz=w400`,
      }));

      const { data: atualizada, error: updateError } = await supabase
        .from('campanhas')
        .update({
          drive_pasta_campanha_id: folder_id,
          imagens: imagensAtualizadas,
          updated_at: new Date().toISOString(),
        })
        .eq('id', data.id)
        .select()
        .single();
      if (updateError) throw updateError;

      if (agendamentoTipo === 'imediato') {
        await dispararCampanha(atualizada);
      }

      const { data: final, error: finalError } = await supabase
        .from('campanhas')
        .select()
        .eq('id', data.id)
        .single();
      if (finalError) throw finalError;

      return res.status(201).json({ data: final });
    } catch (prepErr) {
      console.error(`Falha ao preparar imagens da campanha ${data.id}:`, prepErr);
      await supabase
        .from('campanhas')
        .update({ status: 'erro', erro_mensagem: `Falha ao copiar imagens: ${prepErr.message}` })
        .eq('id', data.id);
      return res.status(500).json({
        error: 'Campanha criada, mas falhou ao preparar as imagens. Veja o histórico.',
        data,
      });
    }
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Erro interno. Tente novamente em instantes.' });
  }
});

// PATCH /api/campanhas/:id/status — callback do n8n quando o disparo termina
// (ou falha). Protegido pelo segredo compartilhado do webhook + instance da
// campanha (o secret e' unico pra todos os corretores, entao sem o check de
// instance qualquer chamador com o secret poderia marcar a campanha de
// qualquer outro corretor so adivinhando o id sequencial).
app.patch('/api/campanhas/:id/status', async (req, res) => {
  if (req.headers['x-webhook-secret'] !== N8N_WEBHOOK_SECRET) {
    return res.status(401).json({ error: 'Não autorizado.' });
  }
  const { status, erro_mensagem: erroMensagem, instance } = req.body;
  if (!['enviada', 'erro'].includes(status)) {
    return res.status(400).json({ error: 'Status inválido.' });
  }
  if (!instance) {
    return res.status(400).json({ error: 'instance é obrigatória.' });
  }
  const updates = { status, updated_at: new Date().toISOString() };
  if (status === 'enviada') updates.enviado_em = new Date().toISOString();
  if (erroMensagem) updates.erro_mensagem = erroMensagem;

  const { error, count } = await supabase
    .from('campanhas')
    .update(updates, { count: 'exact' })
    .eq('id', req.params.id)
    .eq('instance', instance);
  if (error) {
    console.error(error);
    return res.status(500).json({ error: 'Erro interno. Tente novamente em instantes.' });
  }
  if (!count) return res.status(404).json({ error: 'Campanha não encontrada para essa instance.' });
  res.json({ ok: true });
});

// POST /api/campanhas/from-whatsapp — cria uma campanha agendada a partir do
// bot do WhatsApp (comando "agenda o disparo pra..."). Protegido pelo mesmo
// segredo compartilhado do webhook (o corretor ja se autenticou no WhatsApp
// pelo numero, nao tem sessao de painel aqui). As mensagens vem prontas do
// n8n (config mensagens_disparo do cliente); sem imagens proprias -- usa a
// pasta compartilhada de teasers no envio, igual ao disparo imediato do bot.
app.post('/api/campanhas/from-whatsapp', async (req, res) => {
  if (req.headers['x-webhook-secret'] !== N8N_WEBHOOK_SECRET) {
    return res.status(401).json({ error: 'Não autorizado.' });
  }
  try {
    const instance = (req.body.instance || '').toString().trim();
    if (!instance) {
      return res.status(400).json({ error: 'instance é obrigatória.' });
    }

    const mensagens = (req.body.mensagens || []).map((m) => String(m).trim()).filter(Boolean);
    if (mensagens.length === 0) {
      return res.status(400).json({ error: 'Nenhuma mensagem de campanha configurada.' });
    }

    const modo = req.body.destinatarios_modo;
    if (!['todos', 'etapa'].includes(modo)) {
      return res.status(400).json({ error: 'Forma de seleção de destinatários inválida.' });
    }
    const etapa = req.body.destinatarios_etapa || null;
    if (modo === 'etapa' && !etapa) {
      return res.status(400).json({ error: 'Etapa de destino é obrigatória.' });
    }

    const agendamentoData = req.body.agendamento_data;
    if (!agendamentoData || new Date(agendamentoData) <= new Date()) {
      return res.status(400).json({ error: 'Escolha uma data/hora futura para o agendamento.' });
    }

    const count = await contarDestinatarios({ modo, etapa, instance });
    if (count === 0) {
      return res.status(400).json({ error: 'Nenhum destinatário encontrado com essa seleção.' });
    }

    const nome = `Campanha via WhatsApp ${new Date().toLocaleDateString('pt-BR')}`;
    const { data, error } = await supabase
      .from('campanhas')
      .insert({
        instance,
        nome,
        mensagens,
        imagens: [],
        destinatarios_modo: modo,
        destinatarios_etapa: etapa,
        destinatarios_lead_ids: null,
        destinatarios_count: count,
        agendamento_tipo: 'agendado',
        agendamento_data: agendamentoData,
        status: 'agendada',
      })
      .select()
      .single();
    if (error) throw error;

    res.status(201).json({ data });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Erro interno. Tente novamente em instantes.' });
  }
});

// DELETE /api/campanhas/:id — cancela uma campanha ainda nao enviada
app.delete('/api/campanhas/:id', requireAuth, async (req, res) => {
  try {
    const { id } = req.params;
    const { data: campanha, error: fetchError } = await supabase
      .from('campanhas')
      .select('status')
      .eq('id', id)
      .eq('instance', req.instance)
      .single();
    if (fetchError || !campanha) {
      return res.status(404).json({ error: 'Campanha não encontrada.' });
    }
    if (campanha.status === 'enviada') {
      return res.status(400).json({ error: 'Campanha já enviada não pode ser cancelada.' });
    }

    // Se ja esta em andamento, avisa o n8n pra interromper de verdade o envio
    // (mesma flag que o comando PARAR do WhatsApp usa) antes de marcar
    // cancelada no banco. Best-effort: se o webhook falhar, ainda assim
    // cancela no painel e loga o problema.
    if (campanha.status === 'enviando' && N8N_CANCELAR_WEBHOOK_URL) {
      try {
        await fetchComTimeout(N8N_CANCELAR_WEBHOOK_URL, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', 'x-webhook-secret': N8N_WEBHOOK_SECRET },
          body: JSON.stringify({ instance: req.instance }),
        }, 10000);
      } catch (cancelErr) {
        console.error(`Falha ao avisar o n8n para cancelar a campanha ${id}:`, cancelErr);
      }
    }

    const { error } = await supabase
      .from('campanhas')
      .update({ status: 'cancelada', updated_at: new Date().toISOString() })
      .eq('id', id);
    if (error) throw error;

    res.json({ ok: true });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Erro interno. Tente novamente em instantes.' });
  }
});

app.get('/api/me', requireAuth, (req, res) => {
  res.json({ instance: req.instance, is_admin: req.isAdmin });
});

// Lista os corretores com acesso ao painel (so o e-mail de login e o
// identificador -- os dados de CRM/WhatsApp ficam no n8n, nao aqui).
app.get('/api/admin/corretores', requireAuth, requireAdmin, async (_req, res) => {
  try {
    const { data: perfis, error } = await supabase
      .from('corretor_perfis')
      .select('user_id, instance, is_admin, drive_pasta_teasers')
      .order('instance');
    if (error) throw error;

    const corretores = await Promise.all(
      (perfis || []).map(async (perfil) => {
        const { data: userData } = await supabase.auth.admin.getUserById(perfil.user_id);
        return {
          instance: perfil.instance,
          is_admin: perfil.is_admin === true,
          drive_pasta_teasers: perfil.drive_pasta_teasers || null,
          email: userData?.user?.email || null,
        };
      }),
    );
    res.json({ data: corretores });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Erro interno. Tente novamente em instantes.' });
  }
});

// Edita campos do corretor ja cadastrado -- por enquanto so os que moram no
// Supabase (drive_pasta_teasers, is_admin). Login/senha do Praedium ficam no
// n8n e ainda nao tem um jeito de editar por aqui.
app.patch('/api/admin/corretores/:instance', requireAuth, requireAdmin, async (req, res) => {
  const updates = {};
  if (req.body.drive_pasta_teasers !== undefined) {
    updates.drive_pasta_teasers = (req.body.drive_pasta_teasers || '').toString().trim() || null;
  }
  if (req.body.is_admin !== undefined) {
    updates.is_admin = Boolean(req.body.is_admin);
  }
  if (Object.keys(updates).length === 0) {
    return res.status(400).json({ error: 'Nada para atualizar.' });
  }
  try {
    const { data, error } = await supabase
      .from('corretor_perfis')
      .update(updates)
      .eq('instance', req.params.instance)
      .select('instance, is_admin, drive_pasta_teasers')
      .maybeSingle();
    if (error) throw error;
    if (!data) return res.status(404).json({ error: 'Corretor não encontrado.' });
    res.json({ ok: true, data });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Erro interno. Tente novamente em instantes.' });
  }
});

// Revoga o acesso do corretor ao painel (login + vinculo em
// corretor_perfis). Nao mexe nos dados de negocio dele (leads, etapas,
// campanhas, nem a linha na tabela `clientes` do n8n com a instancia da
// Evolution) -- so tira o acesso, pra nao apagar historico por engano.
app.delete('/api/admin/corretores/:instance', requireAuth, requireAdmin, async (req, res) => {
  if (req.params.instance === req.instance) {
    return res.status(400).json({ error: 'Você não pode excluir seu próprio acesso.' });
  }
  try {
    const { data: perfil, error: buscaError } = await supabase
      .from('corretor_perfis')
      .select('user_id')
      .eq('instance', req.params.instance)
      .maybeSingle();
    if (buscaError) throw buscaError;
    if (!perfil) return res.status(404).json({ error: 'Corretor não encontrado.' });

    const { error: deleteError } = await supabase.from('corretor_perfis').delete().eq('instance', req.params.instance);
    if (deleteError) throw deleteError;

    await supabase.auth.admin.deleteUser(perfil.user_id).catch((err) => {
      console.error('Falha ao excluir usuário do Auth (perfil já removido):', err);
    });

    res.json({ ok: true });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Erro interno. Tente novamente em instantes.' });
  }
});

// Gera um QR code novo pra reconectar o WhatsApp de um corretor que ja tem
// instancia criada na Evolution -- usa a mesma chave global, so que no
// endpoint de connect (nao cria instancia de novo).
app.post('/api/admin/corretores/:instance/qrcode', requireAuth, requireAdmin, async (req, res) => {
  if (!EVOLUTION_API_URL || !EVOLUTION_API_GLOBAL_KEY) {
    return res.status(500).json({ error: 'EVOLUTION_API_URL ou EVOLUTION_API_GLOBAL_KEY não configurados no painel.' });
  }
  try {
    const resp = await fetchComTimeout(`${EVOLUTION_API_URL}/instance/connect/${encodeURIComponent(req.params.instance)}`, {
      method: 'GET',
      headers: { apikey: EVOLUTION_API_GLOBAL_KEY },
    }, 15000);
    const corpo = await resp.json().catch(() => ({}));
    if (!resp.ok) {
      return res.status(502).json({ error: corpo.message || corpo.error || `Evolution API respondeu ${resp.status}` });
    }
    if (!corpo.base64) {
      // Ja conectado -- a Evolution nao manda QR code nesse caso.
      return res.json({ conectado: true, qrcode_base64: null });
    }
    res.json({ conectado: false, qrcode_base64: corpo.base64 });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Erro interno. Tente novamente em instantes.' });
  }
});

// Checa se ja existe um cliente com esse instance na tabela `clientes` do
// n8n (Evolution/CRM/leads) -- usado pra avisar o admin antes de aprovar um
// cadastro/convite com um identificador que já pertence a outro corretor
// (ex: reaproveitar o link de convite pra alguem que ja tem tudo criado
// manualmente, sem perceber que o identificador bate com o de outra pessoa).
async function clienteJaExiste(instance) {
  if (!N8N_VERIFICAR_CLIENTE_WEBHOOK_URL) return { existe: null, erro: 'N8N_VERIFICAR_CLIENTE_WEBHOOK_URL não configurado no painel.' };
  try {
    const resp = await fetchComTimeout(N8N_VERIFICAR_CLIENTE_WEBHOOK_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'x-webhook-secret': N8N_WEBHOOK_SECRET },
      body: JSON.stringify({ instance }),
    }, 10000);
    const corpo = await resp.json().catch(() => ({}));
    if (!resp.ok) return { existe: null, erro: corpo.error || `n8n respondeu ${resp.status}` };
    return { existe: Boolean(corpo.existe), erro: null };
  } catch (err) {
    return { existe: null, erro: err.message };
  }
}

app.get('/api/admin/corretores/verificar/:instance', requireAuth, requireAdmin, async (req, res) => {
  const resultado = await clienteJaExiste(req.params.instance);
  res.json(resultado);
});

function validarDadosCorretor(d) {
  if (!d.instance || !d.nomeCorretor || !d.email || !d.senha || !d.whatsappNumero || !d.crmLogin || !d.crmSenha) {
    return 'Preencha identificador, nome, e-mail, senha, WhatsApp, login e senha do Praedium.';
  }
  if (d.senha.length < 6) {
    return 'A senha do painel precisa ter pelo menos 6 caracteres.';
  }
  return null;
}

// Cria a instancia do corretor na Evolution API (global key, so usada aqui)
// e devolve o apikey proprio da instancia + o QR code (base64) pra conectar
// o WhatsApp. Falha aqui nao interrompe o cadastro -- o admin pode gerar o
// QR de novo depois, manualmente, se precisar.
async function criarInstanciaEvolution(instance) {
  if (!EVOLUTION_API_URL || !EVOLUTION_API_GLOBAL_KEY) {
    return { ok: false, erro: 'EVOLUTION_API_URL ou EVOLUTION_API_GLOBAL_KEY não configurados no painel.' };
  }
  try {
    const resp = await fetchComTimeout(`${EVOLUTION_API_URL}/instance/create`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', apikey: EVOLUTION_API_GLOBAL_KEY },
      body: JSON.stringify({ instanceName: instance, integration: 'WHATSAPP-BAILEYS', qrcode: true }),
    }, 15000);
    const corpo = await resp.json().catch(() => ({}));
    if (!resp.ok) {
      return { ok: false, erro: corpo.message || corpo.error || `Evolution API respondeu ${resp.status}` };
    }
    return { ok: true, apikey: corpo.hash || '', qrcodeBase64: corpo.qrcode?.base64 || null };
  } catch (err) {
    return { ok: false, erro: err.message };
  }
}

// Usada tanto pelo cadastro direto quanto pela finalizacao de um convite:
// cria o login do painel (Supabase Auth), o vinculo em corretor_perfis, e
// manda o login/senha do Praedium pro n8n (que criptografa e salva na
// tabela `clientes` -- o painel nunca guarda nem ve a chave de
// criptografia). Evolution/Calendar do corretor ficam vazios e precisam
// ser configurados a parte antes de marcar o corretor como ativo.
async function criarCorretorCompleto({ instance, nomeCorretor, email, senha, whatsappNumero, crmLogin, crmSenha, drivePastaTeasers }) {
  const { data: existente } = await supabase
    .from('corretor_perfis')
    .select('instance')
    .eq('instance', instance)
    .maybeSingle();
  if (existente) {
    const erro = new Error('Já existe um corretor cadastrado com esse identificador.');
    erro.status = 409;
    throw erro;
  }

  const { data: novoUsuario, error: authError } = await supabase.auth.admin.createUser({
    email,
    password: senha,
    email_confirm: true,
  });
  if (authError) {
    const erro = new Error(authError.message);
    erro.status = 400;
    throw erro;
  }

  const { error: perfilError } = await supabase
    .from('corretor_perfis')
    .insert({ user_id: novoUsuario.user.id, instance, is_admin: false, drive_pasta_teasers: drivePastaTeasers || null });
  if (perfilError) {
    // Evita deixar uma conta de login orfa (sem corretor_perfis) se o
    // vinculo falhar -- sem isso, o e-mail ficaria "usado" sem dar acesso
    // a nada, e uma nova tentativa de cadastro falharia sem explicacao.
    await supabase.auth.admin.deleteUser(novoUsuario.user.id).catch(() => {});
    throw perfilError;
  }

  const evolucao = await criarInstanciaEvolution(instance);

  let n8nOk = false;
  let n8nErro = null;
  if (N8N_CRIAR_CLIENTE_WEBHOOK_URL) {
    try {
      const resp = await fetchComTimeoutERetry(N8N_CRIAR_CLIENTE_WEBHOOK_URL, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'x-webhook-secret': N8N_WEBHOOK_SECRET },
        body: JSON.stringify({
          instance,
          nome_corretor: nomeCorretor,
          whatsapp_numero: whatsappNumero,
          crm_login: crmLogin,
          crm_senha: crmSenha,
          drive_pasta_teasers: drivePastaTeasers || '',
          evolution_apikey: evolucao.ok ? evolucao.apikey : '',
          evolution_server_url: evolucao.ok ? EVOLUTION_API_URL : '',
        }),
      }, 10000);
      n8nOk = resp.ok;
      if (!resp.ok) {
        const corpo = await resp.json().catch(() => ({}));
        n8nErro = corpo.error || `n8n respondeu ${resp.status}`;
      }
    } catch (n8nErr) {
      n8nErro = n8nErr.message;
    }
  } else {
    n8nErro = 'N8N_CRIAR_CLIENTE_WEBHOOK_URL não configurado no painel.';
  }

  return {
    instance,
    praedium: n8nOk ? 'criado' : 'falhou',
    praedium_erro: n8nOk ? null : n8nErro,
    evolution: evolucao.ok ? 'criado' : 'falhou',
    evolution_erro: evolucao.ok ? null : evolucao.erro,
    qrcode_base64: evolucao.ok ? evolucao.qrcodeBase64 : null,
  };
}

app.post('/api/admin/corretores', requireAuth, requireAdmin, async (req, res) => {
  const dados = {
    instance: (req.body.instance || '').toString().trim(),
    nomeCorretor: (req.body.nome_corretor || '').toString().trim(),
    email: (req.body.email || '').toString().trim(),
    senha: (req.body.senha || '').toString(),
    whatsappNumero: (req.body.whatsapp_numero || '').toString().replace(/\D/g, ''),
    crmLogin: (req.body.crm_login || '').toString().trim(),
    crmSenha: (req.body.crm_senha || '').toString(),
    drivePastaTeasers: (req.body.drive_pasta_teasers || '').toString().trim(),
  };

  const erroValidacao = validarDadosCorretor(dados);
  if (erroValidacao) {
    return res.status(400).json({ error: erroValidacao });
  }

  try {
    const resultado = await criarCorretorCompleto(dados);
    res.status(201).json({ ok: true, painel: 'criado', ...resultado });
  } catch (err) {
    if (err.status) return res.status(err.status).json({ error: err.message });
    console.error(err);
    res.status(500).json({ error: 'Erro interno. Tente novamente em instantes.' });
  }
});

// --- Convites: link publico que o proprio corretor preenche (sem instance
// -- isso o admin define na hora de finalizar), pra nao precisar do admin
// digitar os dados de outra pessoa manualmente.

function gerarTokenConvite() {
  return crypto.randomBytes(20).toString('hex');
}

app.post('/api/admin/convites', requireAuth, requireAdmin, async (_req, res) => {
  try {
    const token = gerarTokenConvite();
    const { error } = await supabase.from('convites_corretor').insert({ token, status: 'pendente' });
    if (error) throw error;
    const base = PANEL_PUBLIC_URL || '';
    res.status(201).json({ token, url: `${base}/convite/${token}` });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Erro interno. Tente novamente em instantes.' });
  }
});

// Lista sem os campos sensiveis (senha/crm_senha nunca voltam pro
// navegador do admin -- a finalizacao usa esses dados so no backend).
app.get('/api/admin/convites', requireAuth, requireAdmin, async (_req, res) => {
  try {
    const { data, error } = await supabase
      .from('convites_corretor')
      .select('id, token, status, nome_corretor, whatsapp_numero, email, crm_login, drive_pasta_teasers, criado_em, preenchido_em')
      .neq('status', 'finalizado')
      .order('criado_em', { ascending: false });
    if (error) throw error;
    const base = PANEL_PUBLIC_URL || '';
    res.json({ data: (data || []).map((c) => ({ ...c, url: `${base}/convite/${c.token}` })) });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Erro interno. Tente novamente em instantes.' });
  }
});

app.delete('/api/admin/convites/:id', requireAuth, requireAdmin, async (req, res) => {
  try {
    const { error } = await supabase.from('convites_corretor').delete().eq('id', req.params.id);
    if (error) throw error;
    res.json({ ok: true });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Erro interno. Tente novamente em instantes.' });
  }
});

// Finaliza um convite ja preenchido: o admin so informa o identificador
// (instance) -- o resto dos dados ja foi preenchido pelo proprio corretor.
app.post('/api/admin/convites/:id/finalizar', requireAuth, requireAdmin, async (req, res) => {
  const instance = (req.body.instance || '').toString().trim();
  if (!instance) {
    return res.status(400).json({ error: 'Informe o identificador (instance) desse corretor.' });
  }

  try {
    const { data: convite, error: buscaError } = await supabase
      .from('convites_corretor')
      .select('*')
      .eq('id', req.params.id)
      .maybeSingle();
    if (buscaError) throw buscaError;
    if (!convite || convite.status !== 'preenchido') {
      return res.status(404).json({ error: 'Convite não encontrado ou ainda não preenchido pelo corretor.' });
    }

    const resultado = await criarCorretorCompleto({
      instance,
      nomeCorretor: convite.nome_corretor,
      email: convite.email,
      senha: convite.senha,
      whatsappNumero: convite.whatsapp_numero,
      crmLogin: convite.crm_login,
      crmSenha: convite.crm_senha,
      drivePastaTeasers: convite.drive_pasta_teasers,
    });

    // Apaga o convite (e a senha em texto puro que ele guardava) assim que
    // a conta de verdade existe -- nao ha mais motivo pra manter isso salvo.
    await supabase.from('convites_corretor').delete().eq('id', req.params.id);

    res.status(201).json({ ok: true, painel: 'criado', ...resultado });
  } catch (err) {
    if (err.status) return res.status(err.status).json({ error: err.message });
    console.error(err);
    res.status(500).json({ error: 'Erro interno. Tente novamente em instantes.' });
  }
});

// GET publico (sem auth): so confirma se o link ainda e valido, pra
// decidir se mostra o formulario ou uma mensagem de erro.
app.get('/api/convites/:token', async (req, res) => {
  try {
    const { data: convite } = await supabase
      .from('convites_corretor')
      .select('status')
      .eq('token', req.params.token)
      .maybeSingle();
    if (!convite || convite.status !== 'pendente') {
      return res.status(404).json({ error: 'Convite inválido, expirado ou já utilizado.' });
    }
    res.json({ valido: true });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Erro interno. Tente novamente em instantes.' });
  }
});

// POST publico (sem auth, protegido pelo token unico do link): o proprio
// corretor preenche os dados dele. So grava -- a criacao de verdade
// acontece quando o admin finaliza, ja com o identificador definido.
app.post('/api/convites/:token', async (req, res) => {
  const nomeCorretor = (req.body.nome_corretor || '').toString().trim();
  const whatsappNumero = (req.body.whatsapp_numero || '').toString().replace(/\D/g, '');
  const email = (req.body.email || '').toString().trim();
  const senha = (req.body.senha || '').toString();
  const crmLogin = (req.body.crm_login || '').toString().trim();
  const crmSenha = (req.body.crm_senha || '').toString();
  const drivePastaTeasers = (req.body.drive_pasta_teasers || '').toString().trim();

  if (!nomeCorretor || !whatsappNumero || !email || !senha || !crmLogin || !crmSenha) {
    return res.status(400).json({ error: 'Preencha nome, WhatsApp, e-mail, senha, login e senha do Praedium.' });
  }
  if (senha.length < 6) {
    return res.status(400).json({ error: 'A senha do painel precisa ter pelo menos 6 caracteres.' });
  }

  try {
    const { data: convite, error: buscaError } = await supabase
      .from('convites_corretor')
      .select('id, status')
      .eq('token', req.params.token)
      .maybeSingle();
    if (buscaError) throw buscaError;
    if (!convite || convite.status !== 'pendente') {
      return res.status(404).json({ error: 'Convite inválido, expirado ou já utilizado.' });
    }

    const { error } = await supabase
      .from('convites_corretor')
      .update({
        nome_corretor: nomeCorretor,
        whatsapp_numero: whatsappNumero,
        email,
        senha,
        crm_login: crmLogin,
        crm_senha: crmSenha,
        drive_pasta_teasers: drivePastaTeasers || null,
        status: 'preenchido',
        preenchido_em: new Date().toISOString(),
      })
      .eq('id', convite.id);
    if (error) throw error;

    res.json({ ok: true });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Erro interno. Tente novamente em instantes.' });
  }
});

app.get('/api/health', (_req, res) => res.json({ ok: true }));

// Em producao, serve o build estatico do React
if (process.env.NODE_ENV === 'production') {
  const path = await import('node:path');
  const { fileURLToPath } = await import('node:url');
  const __dirname = path.dirname(fileURLToPath(import.meta.url));
  const distPath = path.join(__dirname, '..', 'dist');
  app.use(express.static(distPath));
  app.get('*', (_req, res) => res.sendFile(path.join(distPath, 'index.html')));
}

// Verifica a cada minuto se alguma campanha agendada venceu. A atualizacao
// condicional (eq('status','agendada')) funciona como uma trava otimista:
// so processa quem essa mesma chamada conseguiu "reservar", evitando duplo
// disparo se um tick anterior ainda estiver rodando.
const SCHEDULER_INTERVAL_MS = 60 * 1000;
async function processarCampanhasAgendadas() {
  try {
    const { data: pendentes, error } = await supabase
      .from('campanhas')
      .select()
      .eq('status', 'agendada')
      .lte('agendamento_data', new Date().toISOString());
    if (error) throw error;

    for (const campanha of pendentes || []) {
      const { data: reservada } = await supabase
        .from('campanhas')
        .update({ status: 'enviando', updated_at: new Date().toISOString() })
        .eq('id', campanha.id)
        .eq('status', 'agendada')
        .select()
        .single();
      if (reservada) await dispararCampanha(reservada);
    }
  } catch (err) {
    console.error('Erro no scheduler de campanhas:', err);
  }
}

export {
  app,
  sanitizarTermoBusca,
  processarCampanhasAgendadas,
  SCHEDULER_INTERVAL_MS,
};
