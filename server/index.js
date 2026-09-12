import 'dotenv/config';
import express from 'express';
import cors from 'cors';
import { createClient } from '@supabase/supabase-js';

const {
  SUPABASE_URL,
  SUPABASE_SERVICE_ROLE_KEY,
  PANEL_INSTANCE = 'Renan',
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
app.use(express.json());

const ALLOWED_SORT_COLUMNS = new Set(['nome', 'status', 'origem', 'created_at', 'updated_at']);

// GET /api/leads?page=1&pageSize=25&status=&origem=&search=&sortBy=created_at&sortDir=desc
app.get('/api/leads', async (req, res) => {
  try {
    const page = Math.max(1, parseInt(req.query.page, 10) || 1);
    const pageSize = Math.min(100, Math.max(1, parseInt(req.query.pageSize, 10) || 25));
    const sortBy = ALLOWED_SORT_COLUMNS.has(req.query.sortBy) ? req.query.sortBy : 'created_at';
    const sortDir = req.query.sortDir === 'asc' ? true : false;

    let query = supabase
      .from('leads')
      .select('*', { count: 'exact' })
      .eq('instance', PANEL_INSTANCE);

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
app.get('/api/leads/statuses', async (_req, res) => {
  try {
    const { data, error } = await supabase
      .from('leads')
      .select('status')
      .eq('instance', PANEL_INSTANCE);
    if (error) throw error;
    const statuses = Array.from(new Set(data.map((r) => r.status).filter(Boolean)));
    res.json({ statuses });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: err.message });
  }
});

// GET /api/leads/origens — distinct origem values, para o filtro
app.get('/api/leads/origens', async (_req, res) => {
  try {
    const { data, error } = await supabase
      .from('leads')
      .select('origem')
      .eq('instance', PANEL_INSTANCE);
    if (error) throw error;
    const origens = Array.from(new Set(data.map((r) => r.origem).filter(Boolean)));
    res.json({ origens });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: err.message });
  }
});

// PATCH /api/leads/:id — usado pelo Kanban (mudar status) e edicao pontual
app.patch('/api/leads/:id', async (req, res) => {
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
      .eq('instance', PANEL_INSTANCE)
      .select()
      .single();
    if (error) throw error;

    res.json({ data });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: err.message });
  }
});

app.get('/api/health', (_req, res) => res.json({ ok: true, instance: PANEL_INSTANCE }));

// Em producao, serve o build estatico do React
if (process.env.NODE_ENV === 'production') {
  const path = await import('node:path');
  const { fileURLToPath } = await import('node:url');
  const __dirname = path.dirname(fileURLToPath(import.meta.url));
  const distPath = path.join(__dirname, '..', 'dist');
  app.use(express.static(distPath));
  app.get('*', (_req, res) => res.sendFile(path.join(distPath, 'index.html')));
}

app.listen(PORT, () => {
  console.log(`Painel de Leads rodando na porta ${PORT} (instance=${PANEL_INSTANCE})`);
});
