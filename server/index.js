import 'dotenv/config';
import express from 'express';
import cors from 'cors';
import { createClient } from '@supabase/supabase-js';

const {
  SUPABASE_URL,
  SUPABASE_SERVICE_ROLE_KEY,
  GOOGLE_DRIVE_API_KEY,
  N8N_DISPARO_WEBHOOK_URL,
  N8N_COPIAR_IMAGENS_WEBHOOK_URL,
  N8N_CANCELAR_WEBHOOK_URL,
  N8N_ADICIONAR_IMAGEM_WEBHOOK_URL,
  N8N_WEBHOOK_SECRET,
  PORT = 8090,
} = process.env;

if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) {
  console.error('Faltando SUPABASE_URL ou SUPABASE_SERVICE_ROLE_KEY no .env');
  process.exit(1);
}

const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, {
  auth: { persistSession: false },
});

const app = express();
app.use(cors());
// Limite maior que o default (100kb) por causa do upload de imagens em base64
// na criacao/edicao de campanhas.
app.use(express.json({ limit: '15mb' }));

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
    .select('instance, drive_pasta_teasers')
    .eq('user_id', userData.user.id)
    .maybeSingle();
  if (perfilError || !perfil) {
    return res.status(403).json({ error: 'Conta não vinculada a nenhum corretor.' });
  }
  req.instance = perfil.instance;
  req.driveFolder = perfil.drive_pasta_teasers;
  req.user = userData.user;
  next();
}

const ALLOWED_SORT_COLUMNS = new Set(['nome', 'status', 'origem', 'created_at', 'updated_at']);

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
      const term = req.query.search.trim();
      query = query.or(`nome.ilike.%${term}%,numero.ilike.%${term}%`);
    }

    const from = (page - 1) * pageSize;
    const to = from + pageSize - 1;
    query = query.order(sortBy, { ascending: sortDir }).range(from, to);

    const { data, error, count } = await query;
    if (error) throw error;

    res.json({ data, total: count ?? 0, page, pageSize });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: err.message });
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
    res.status(500).json({ error: err.message });
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
    res.status(500).json({ error: err.message });
  }
});

// PATCH /api/leads/:id — usado pelo Kanban (mudar status) e edicao pontual
app.patch('/api/leads/:id', requireAuth, async (req, res) => {
  try {
    const { id } = req.params;
    const allowedFields = ['status', 'notas', 'nome', 'sobrenome'];
    const updates = {};
    for (const field of allowedFields) {
      if (req.body[field] !== undefined) updates[field] = req.body[field];
    }
    if (Object.keys(updates).length === 0) {
      return res.status(400).json({ error: 'Nenhum campo válido para atualizar.' });
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
    res.status(500).json({ error: err.message });
  }
});

const MAX_ETAPAS = 12;
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
    res.status(500).json({ error: err.message });
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
    res.status(500).json({ error: err.message });
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
    res.status(500).json({ error: err.message });
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
    res.status(500).json({ error: err.message });
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
    res.status(500).json({ error: err.message });
  }
});

const MIN_MENSAGENS = 3;
const MAX_IMAGENS = 4;

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

    const resp = await fetchComTimeout(N8N_DISPARO_WEBHOOK_URL, {
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
    res.status(500).json({ error: err.message });
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
    res.status(500).json({ error: err.message });
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
    res.status(500).json({ error: err.message });
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
    res.status(500).json({ error: err.message });
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
    res.status(500).json({ error: err.message });
  }
});

// PATCH /api/campanhas/:id/status — callback do n8n quando o disparo termina
// (ou falha). Protegido pelo mesmo segredo compartilhado do webhook.
app.patch('/api/campanhas/:id/status', async (req, res) => {
  if (req.headers['x-webhook-secret'] !== N8N_WEBHOOK_SECRET) {
    return res.status(401).json({ error: 'Não autorizado.' });
  }
  const { status, erro_mensagem: erroMensagem } = req.body;
  if (!['enviada', 'erro'].includes(status)) {
    return res.status(400).json({ error: 'Status inválido.' });
  }
  const updates = { status, updated_at: new Date().toISOString() };
  if (status === 'enviada') updates.enviado_em = new Date().toISOString();
  if (erroMensagem) updates.erro_mensagem = erroMensagem;

  const { error } = await supabase.from('campanhas').update(updates).eq('id', req.params.id);
  if (error) return res.status(500).json({ error: error.message });
  res.json({ ok: true });
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
    res.status(500).json({ error: err.message });
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
setInterval(processarCampanhasAgendadas, SCHEDULER_INTERVAL_MS);

app.listen(PORT, () => {
  console.log(`Painel de Leads rodando na porta ${PORT}`);
});
