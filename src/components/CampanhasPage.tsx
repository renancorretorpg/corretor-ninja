import { useMemo, useState, type ChangeEvent } from 'react';
import {
  useBuscarLeads,
  useCampanhaImagens,
  useCampanhas,
  useCancelarCampanha,
  useCreateCampanha,
  useDestinatariosContagem,
  useEtapas,
  useUploadCampanhaImagens,
} from '../api';
import type { AgendamentoTipo, Campanha, DestinatariosModo, ImagemDrive, Lead } from '../types';
import { Badge, Button, Card, Input, Select } from './ui';
import { formatDataHora, formatTelefone, mesmoDiaSaoPaulo } from '../utils';
import { useDebouncedValue } from '../useDebouncedValue';

const MIN_MENSAGENS = 3;
const MAX_IMAGENS = 4;
const INTERVALO_MIN_ENTRE_CAMPANHAS_MS = 5 * 60 * 1000;
const MAX_CAMPANHAS_POR_DIA = 5;

type Aba = 'nova' | 'historico';
type Etapa = 1 | 2 | 3 | 4 | 5;

function statusBadge(status: Campanha['status']) {
  const map: Record<Campanha['status'], { label: string; tone: 'default' | 'success' | 'warning' | 'muted' | 'danger' }> = {
    pendente_envio: { label: 'Pendente de envio', tone: 'warning' },
    agendada: { label: 'Agendada', tone: 'default' },
    enviando: { label: 'Enviando...', tone: 'default' },
    enviada: { label: 'Enviada', tone: 'success' },
    erro: { label: 'Erro', tone: 'danger' },
    cancelada: { label: 'Cancelada', tone: 'muted' },
  };
  const { label, tone } = map[status];
  return <Badge tone={tone}>{label}</Badge>;
}

function destinatariosDescricao(c: Campanha): string {
  if (c.destinatarios_modo === 'todos') return `Todos os contatos (${c.destinatarios_count})`;
  if (c.destinatarios_modo === 'etapa') return `Etapa "${c.destinatarios_etapa}" (${c.destinatarios_count})`;
  return `Seleção manual (${c.destinatarios_count})`;
}

function estadoInicial() {
  return {
    nome: '',
    mensagens: ['', '', ''] as string[],
    imagens: [] as ImagemDrive[],
    destinatariosModo: 'todos' as DestinatariosModo,
    destinatariosEtapa: undefined as string | undefined,
    leadsSelecionados: new Map<number, Lead>(),
    agendamentoTipo: 'imediato' as AgendamentoTipo,
    agendamentoData: '',
  };
}

function WizardMensagens({
  mensagens,
  onChange,
}: {
  mensagens: string[];
  onChange: (v: string[]) => void;
}) {
  function atualizar(i: number, valor: string) {
    const nova = [...mensagens];
    nova[i] = valor;
    onChange(nova);
  }
  function adicionar() {
    onChange([...mensagens, '']);
  }
  function remover(i: number) {
    onChange(mensagens.filter((_, idx) => idx !== i));
  }

  return (
    <div>
      <p className="mb-3 text-sm text-muted-foreground">
        Cadastre pelo menos {MIN_MENSAGENS} variantes de texto. Uma delas é sorteada aleatoriamente pra cada envio.
      </p>
      <div className="space-y-2">
        {mensagens.map((m, i) => (
          <div key={i} className="flex flex-col gap-2 sm:flex-row sm:items-start">
            <textarea
              value={m}
              onChange={(e) => atualizar(i, e.target.value)}
              placeholder={`Variante ${i + 1}...`}
              rows={2}
              className="flex-1 rounded-md border border-border bg-background px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-primary/30"
            />
            {mensagens.length > MIN_MENSAGENS && (
              <Button
                variant="ghost"
                className="self-end text-red-600 hover:bg-red-50 sm:self-auto"
                onClick={() => remover(i)}
              >
                Remover
              </Button>
            )}
          </div>
        ))}
      </div>
      <Button variant="outline" className="mt-2" onClick={adicionar}>
        + Adicionar variante
      </Button>
    </div>
  );
}

function fileParaBase64(file: File): Promise<{ base64: string; fileName: string; mimetype: string }> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      const resultado = reader.result as string;
      const base64 = resultado.split(',')[1] || '';
      resolve({ base64, fileName: file.name, mimetype: file.type || 'image/jpeg' });
    };
    reader.onerror = () => reject(new Error('Falha ao ler o arquivo.'));
    reader.readAsDataURL(file);
  });
}

function WizardImagens({
  selecionadas,
  onChange,
}: {
  selecionadas: ImagemDrive[];
  onChange: (v: ImagemDrive[]) => void;
}) {
  const { data, isLoading } = useCampanhaImagens();
  const uploadImagens = useUploadCampanhaImagens();
  const [erroUpload, setErroUpload] = useState('');

  function toggle(img: ImagemDrive) {
    const jaSelecionada = selecionadas.some((s) => s.id === img.id);
    if (jaSelecionada) {
      onChange(selecionadas.filter((s) => s.id !== img.id));
    } else if (selecionadas.length < MAX_IMAGENS) {
      onChange([...selecionadas, img]);
    }
  }

  async function handleUpload(e: ChangeEvent<HTMLInputElement>) {
    const arquivos = Array.from(e.target.files ?? []);
    e.target.value = '';
    if (arquivos.length === 0) return;
    setErroUpload('');
    try {
      const imagens = await Promise.all(arquivos.map(fileParaBase64));
      const { files } = await uploadImagens.mutateAsync(imagens);
      onChange([...selecionadas, ...files].slice(0, MAX_IMAGENS));
    } catch (err) {
      setErroUpload((err as Error).message);
    }
  }

  return (
    <div>
      <p className="mb-3 text-sm text-muted-foreground">
        Selecione até {MAX_IMAGENS} imagens (opcional) — {selecionadas.length}/{MAX_IMAGENS} selecionadas.
      </p>

      {isLoading ? (
        <p className="mb-3 text-sm text-muted-foreground">Carregando galeria...</p>
      ) : !data?.configurado ? (
        <p className="mb-3 text-sm text-amber-700">
          A galeria de imagens do Drive ainda não está configurada neste painel (falta a chave da API do
          Google) — não dá pra listar as fotos existentes, mas você pode enviar fotos novas abaixo.
        </p>
      ) : data.imagens.length === 0 ? (
        <p className="mb-3 text-sm text-muted-foreground">Nenhuma imagem na sua pasta do Drive ainda — envie uma abaixo.</p>
      ) : (
        <div className="mb-3 grid grid-cols-2 gap-3 sm:grid-cols-3 md:grid-cols-4">
          {data.imagens.map((img) => {
            const ativa = selecionadas.some((s) => s.id === img.id);
            const bloqueada = !ativa && selecionadas.length >= MAX_IMAGENS;
            return (
              <button
                key={img.id}
                type="button"
                onClick={() => toggle(img)}
                disabled={bloqueada}
                className={`overflow-hidden rounded-lg border-2 text-left transition-colors disabled:opacity-40 ${
                  ativa ? 'border-primary' : 'border-border'
                }`}
              >
                <img src={img.url} alt={img.nome} className="h-24 w-full object-cover" />
                <p className="truncate px-1.5 py-1 text-xs">{img.nome}</p>
              </button>
            );
          })}
        </div>
      )}

      <input
        type="file"
        accept="image/*"
        multiple
        onChange={handleUpload}
        disabled={uploadImagens.isPending}
        className="hidden"
        id="upload-imagens-campanha"
      />
      <Button
        variant="outline"
        type="button"
        disabled={uploadImagens.isPending}
        onClick={() => document.getElementById('upload-imagens-campanha')?.click()}
      >
        {uploadImagens.isPending ? 'Enviando...' : '+ Adicionar fotos'}
      </Button>
      {erroUpload && <p className="mt-2 text-sm text-red-600">{erroUpload}</p>}
    </div>
  );
}

function WizardDestinatarios({
  modo,
  onModoChange,
  etapa,
  onEtapaChange,
  leadsSelecionados,
  onLeadsChange,
}: {
  modo: DestinatariosModo;
  onModoChange: (v: DestinatariosModo) => void;
  etapa: string | undefined;
  onEtapaChange: (v: string) => void;
  leadsSelecionados: Map<number, Lead>;
  onLeadsChange: (v: Map<number, Lead>) => void;
}) {
  const { data: etapasData } = useEtapas();
  const [busca, setBusca] = useState('');
  const buscaDebounced = useDebouncedValue(busca);
  const { data: buscaData } = useBuscarLeads(buscaDebounced);
  const leadIds = useMemo(() => Array.from(leadsSelecionados.keys()), [leadsSelecionados]);
  const { data: contagemData, isFetching: contando } = useDestinatariosContagem(modo, etapa, leadIds);

  function alternarLead(lead: Lead) {
    const nova = new Map(leadsSelecionados);
    if (nova.has(lead.id)) nova.delete(lead.id);
    else nova.set(lead.id, lead);
    onLeadsChange(nova);
  }

  return (
    <div>
      <div className="mb-3 flex flex-col gap-1">
        <label className="flex min-h-[44px] items-center gap-2 text-sm">
          <input type="radio" checked={modo === 'todos'} onChange={() => onModoChange('todos')} />
          Todos os contatos
        </label>
        <label className="flex min-h-[44px] items-center gap-2 text-sm">
          <input type="radio" checked={modo === 'etapa'} onChange={() => onModoChange('etapa')} />
          Por etapa do funil
        </label>
        <label className="flex min-h-[44px] items-center gap-2 text-sm">
          <input type="radio" checked={modo === 'manual'} onChange={() => onModoChange('manual')} />
          Selecionar um a um
        </label>
      </div>

      {modo === 'etapa' && (
        <Select value={etapa ?? ''} onChange={(e) => onEtapaChange(e.target.value)} className="mb-3 w-full sm:max-w-xs">
          <option value="">Selecione a etapa...</option>
          {etapasData?.data.map((et) => (
            <option key={et.id} value={et.nome}>
              {et.nome} ({et.leadCount})
            </option>
          ))}
        </Select>
      )}

      {modo === 'manual' && (
        <div className="mb-3">
          <Input
            placeholder="Buscar por nome ou telefone..."
            value={busca}
            onChange={(e) => setBusca(e.target.value)}
            className="w-full sm:max-w-xs"
          />
          {buscaData && buscaData.data.length > 0 && (
            <div className="mt-2 max-h-40 w-full overflow-y-auto rounded-md border border-border sm:max-w-md">
              {buscaData.data.map((lead) => (
                <button
                  key={lead.id}
                  type="button"
                  onClick={() => alternarLead(lead)}
                  className="flex min-h-[44px] w-full items-center justify-between px-3 py-1.5 text-left text-sm hover:bg-muted"
                >
                  <span>
                    {lead.nome} {lead.sobrenome ?? ''} · {formatTelefone(lead.numero)}
                  </span>
                  {leadsSelecionados.has(lead.id) && <span className="text-primary">✓</span>}
                </button>
              ))}
            </div>
          )}
          {leadsSelecionados.size > 0 && (
            <div className="mt-2 flex flex-wrap gap-1.5">
              {Array.from(leadsSelecionados.values()).map((lead) => (
                <span
                  key={lead.id}
                  className="inline-flex items-center gap-1 rounded-full bg-muted px-2 py-0.5 text-xs"
                >
                  {lead.nome}
                  <button type="button" onClick={() => alternarLead(lead)} className="text-muted-foreground hover:text-foreground">
                    ×
                  </button>
                </span>
              ))}
            </div>
          )}
        </div>
      )}

      <p className="text-sm font-medium">
        {contando ? 'Calculando...' : `${contagemData?.count ?? 0} destinatário(s) serão atingidos.`}
      </p>
    </div>
  );
}

function WizardAgendamento({
  tipo,
  onTipoChange,
  data,
  onDataChange,
}: {
  tipo: AgendamentoTipo;
  onTipoChange: (v: AgendamentoTipo) => void;
  data: string;
  onDataChange: (v: string) => void;
}) {
  return (
    <div className="flex flex-col gap-1">
      <label className="flex min-h-[44px] items-center gap-2 text-sm">
        <input type="radio" checked={tipo === 'imediato'} onChange={() => onTipoChange('imediato')} />
        Disparar imediatamente
      </label>
      <label className="flex min-h-[44px] items-center gap-2 text-sm">
        <input type="radio" checked={tipo === 'agendado'} onChange={() => onTipoChange('agendado')} />
        Agendar para depois
      </label>
      {tipo === 'agendado' && (
        <input
          type="datetime-local"
          value={data}
          onChange={(e) => onDataChange(e.target.value)}
          className="mt-1 h-11 w-full rounded-md border border-border bg-background px-3 text-sm outline-none focus:ring-2 focus:ring-primary/30 sm:w-56"
        />
      )}
    </div>
  );
}

export function CampanhasPage() {
  const [aba, setAba] = useState<Aba>('nova');
  const [etapaAtual, setEtapaAtual] = useState<Etapa>(1);
  const [draft, setDraft] = useState(estadoInicial());
  const [erro, setErro] = useState('');
  const createCampanha = useCreateCampanha();
  const { data: campanhasData } = useCampanhas();

  const leadIds = useMemo(() => Array.from(draft.leadsSelecionados.keys()), [draft.leadsSelecionados]);
  const { data: contagemFinal } = useDestinatariosContagem(draft.destinatariosModo, draft.destinatariosEtapa, leadIds);

  // Mesma regra do backend (MAX_CAMPANHAS_POR_DIA campanhas criadas por dia,
  // fuso de Sao Paulo) -- avisa antes do corretor preencher o wizard inteiro
  // pra so descobrir no final que nao pode criar mais uma hoje.
  const agora = new Date().toISOString();
  const campanhasCriadasHoje = (campanhasData?.data ?? []).filter((c) => mesmoDiaSaoPaulo(c.created_at, agora)).length;
  const jaCriouCampanhaHoje = campanhasCriadasHoje >= MAX_CAMPANHAS_POR_DIA;

  function resetar() {
    setDraft(estadoInicial());
    setEtapaAtual(1);
    setErro('');
  }

  function validarEtapa(e: Etapa): string | null {
    if (e === 1) {
      const validas = draft.mensagens.map((m) => m.trim()).filter(Boolean);
      if (validas.length < MIN_MENSAGENS) return `Cadastre pelo menos ${MIN_MENSAGENS} variantes de mensagem.`;
    }
    if (e === 3) {
      if (draft.destinatariosModo === 'etapa' && !draft.destinatariosEtapa) return 'Selecione a etapa de destino.';
      if (draft.destinatariosModo === 'manual' && draft.leadsSelecionados.size === 0)
        return 'Selecione ao menos um lead.';
    }
    if (e === 4) {
      if (draft.agendamentoTipo === 'agendado') {
        if (!draft.agendamentoData) return 'Escolha a data e hora do agendamento.';
        if (new Date(draft.agendamentoData) <= new Date()) return 'Escolha uma data/hora futura.';
      }
      // Mesma trava de 5 min do backend, so que aqui pra avisar antes de
      // chegar na revisão -- o backend ainda reforça isso na hora de salvar.
      const horarioNovo = draft.agendamentoTipo === 'imediato' ? new Date() : new Date(draft.agendamentoData);
      const pendentes = (campanhasData?.data ?? []).filter((c) =>
        ['pendente_envio', 'agendada', 'enviando'].includes(c.status),
      );
      const conflito = pendentes.find((c) => {
        const horarioExistente =
          c.agendamento_tipo === 'imediato' || !c.agendamento_data ? new Date(c.created_at) : new Date(c.agendamento_data);
        return Math.abs(horarioExistente.getTime() - horarioNovo.getTime()) < INTERVALO_MIN_ENTRE_CAMPANHAS_MS;
      });
      if (conflito) {
        return `Já existe uma campanha ("${conflito.nome}") com envio muito próximo desse horário. Escolha um horário com pelo menos 5 minutos de diferença, pra reduzir o risco de bloqueio no WhatsApp.`;
      }
    }
    return null;
  }

  function avancar() {
    const erroEtapa = validarEtapa(etapaAtual);
    if (erroEtapa) {
      setErro(erroEtapa);
      return;
    }
    setErro('');
    setEtapaAtual((e) => (e + 1) as Etapa);
  }

  function voltar() {
    setErro('');
    setEtapaAtual((e) => (e - 1) as Etapa);
  }

  function confirmar() {
    setErro('');
    createCampanha.mutate(
      {
        nome: draft.nome || undefined,
        mensagens: draft.mensagens.map((m) => m.trim()).filter(Boolean),
        imagens: draft.imagens,
        destinatarios_modo: draft.destinatariosModo,
        destinatarios_etapa: draft.destinatariosEtapa,
        destinatarios_lead_ids: leadIds,
        agendamento_tipo: draft.agendamentoTipo,
        agendamento_data: draft.agendamentoTipo === 'agendado' ? new Date(draft.agendamentoData).toISOString() : undefined,
      },
      {
        onSuccess: () => {
          resetar();
          setAba('historico');
        },
        onError: (err) => setErro((err as Error).message),
      },
    );
  }

  const passos = ['Mensagens', 'Imagens', 'Destinatários', 'Agendamento', 'Revisão'];

  return (
    <div>
      <div className="mb-4 flex gap-1 rounded-lg border border-border p-1 sm:w-fit">
        <Button
          className="flex-1 sm:flex-none"
          variant={aba === 'nova' ? 'default' : 'ghost'}
          onClick={() => setAba('nova')}
        >
          Nova campanha
        </Button>
        <Button
          className="flex-1 sm:flex-none"
          variant={aba === 'historico' ? 'default' : 'ghost'}
          onClick={() => setAba('historico')}
        >
          Histórico
        </Button>
      </div>

      {aba === 'historico' ? (
        <HistoricoCampanhas />
      ) : jaCriouCampanhaHoje ? (
        <Card className="p-4">
          <p className="text-sm text-amber-700">
            ⚠️ Você já criou {campanhasCriadasHoje} campanhas hoje. Pra reduzir o risco de bloqueio no WhatsApp, só
            são permitidas {MAX_CAMPANHAS_POR_DIA} campanhas novas por dia — tente novamente amanhã, ou veja o{' '}
            <button className="underline" onClick={() => setAba('historico')}>
              histórico
            </button>{' '}
            pra acompanhar as de hoje.
          </p>
        </Card>
      ) : (
        <Card className="p-4">
          <div className="mb-4 flex flex-wrap items-center gap-x-2 gap-y-1 text-xs text-muted-foreground">
            {passos.map((p, i) => (
              <span key={p} className={`flex items-center gap-2 ${i + 1 === etapaAtual ? 'font-semibold text-foreground' : ''}`}>
                {i > 0 && <span>→</span>}
                {i + 1}. {p}
              </span>
            ))}
          </div>

          {etapaAtual === 1 && (
            <WizardMensagens mensagens={draft.mensagens} onChange={(v) => setDraft({ ...draft, mensagens: v })} />
          )}
          {etapaAtual === 2 && (
            <WizardImagens selecionadas={draft.imagens} onChange={(v) => setDraft({ ...draft, imagens: v })} />
          )}
          {etapaAtual === 3 && (
            <WizardDestinatarios
              modo={draft.destinatariosModo}
              onModoChange={(v) => setDraft({ ...draft, destinatariosModo: v })}
              etapa={draft.destinatariosEtapa}
              onEtapaChange={(v) => setDraft({ ...draft, destinatariosEtapa: v })}
              leadsSelecionados={draft.leadsSelecionados}
              onLeadsChange={(v) => setDraft({ ...draft, leadsSelecionados: v })}
            />
          )}
          {etapaAtual === 4 && (
            <WizardAgendamento
              tipo={draft.agendamentoTipo}
              onTipoChange={(v) => setDraft({ ...draft, agendamentoTipo: v })}
              data={draft.agendamentoData}
              onDataChange={(v) => setDraft({ ...draft, agendamentoData: v })}
            />
          )}
          {etapaAtual === 5 && (
            <div className="space-y-3 break-words text-sm">
              <div>
                <Input
                  placeholder="Nome interno da campanha (opcional)"
                  value={draft.nome}
                  onChange={(e) => setDraft({ ...draft, nome: e.target.value })}
                  className="w-full sm:max-w-sm"
                />
              </div>
              <p>
                <strong>{draft.mensagens.map((m) => m.trim()).filter(Boolean).length}</strong> variantes de mensagem
              </p>
              <div className="flex flex-wrap gap-2">
                {draft.imagens.length === 0 ? (
                  <span className="text-muted-foreground">Sem imagens (só texto)</span>
                ) : (
                  draft.imagens.map((img) => (
                    <img key={img.id} src={img.url} alt={img.nome} className="h-16 w-16 rounded object-cover" />
                  ))
                )}
              </div>
              <p>
                Destinatários:{' '}
                <strong>
                  {draft.destinatariosModo === 'todos' && 'Todos os contatos'}
                  {draft.destinatariosModo === 'etapa' && `Etapa "${draft.destinatariosEtapa}"`}
                  {draft.destinatariosModo === 'manual' && 'Seleção manual'}
                  {' — '}
                  {contagemFinal?.count ?? 0} pessoa(s)
                </strong>
              </p>
              <p>
                Envio:{' '}
                <strong>
                  {draft.agendamentoTipo === 'imediato'
                    ? 'Imediato, assim que confirmar'
                    : draft.agendamentoData
                      ? formatDataHora(new Date(draft.agendamentoData).toISOString())
                      : '—'}
                </strong>
              </p>
            </div>
          )}

          {erro && <p className="mt-3 text-sm text-red-600">{erro}</p>}

          <div className="mt-4 flex flex-col-reverse gap-2 sm:flex-row sm:justify-between">
            <Button variant="outline" onClick={voltar} disabled={etapaAtual === 1}>
              Voltar
            </Button>
            {etapaAtual < 5 ? (
              <Button onClick={avancar}>Próximo</Button>
            ) : (
              <Button onClick={confirmar} disabled={createCampanha.isPending}>
                Confirmar e criar campanha
              </Button>
            )}
          </div>
        </Card>
      )}
    </div>
  );
}

function HistoricoCampanhas() {
  const { data, isLoading, isError, error } = useCampanhas();
  const cancelarCampanha = useCancelarCampanha();

  if (isError) {
    return <p className="text-sm text-red-600">Erro ao carregar campanhas: {(error as Error).message}</p>;
  }
  if (isLoading) {
    return <p className="text-sm text-muted-foreground">Carregando...</p>;
  }
  if (!data || data.data.length === 0) {
    return <p className="text-sm text-muted-foreground">Nenhuma campanha criada ainda.</p>;
  }

  return (
    <Card>
      {data.data.map((c) => (
        <div
          key={c.id}
          className="flex flex-col gap-2 border-b border-border px-4 py-3 last:border-b-0 sm:flex-row sm:items-center sm:justify-between sm:gap-3"
        >
          <div className="min-w-0">
            <p className="text-sm font-medium">{c.nome}</p>
            <p className="text-xs text-muted-foreground">
              {destinatariosDescricao(c)} ·{' '}
              {c.agendamento_tipo === 'imediato' || !c.agendamento_data
                ? 'Envio imediato'
                : `Agendada para ${formatDataHora(c.agendamento_data)}`}{' '}
              · criada em {formatDataHora(c.created_at)}
            </p>
            {c.status === 'erro' && c.erro_mensagem && (
              <p className="mt-1 text-xs text-red-600">{c.erro_mensagem}</p>
            )}
          </div>
          <div className="flex items-center gap-2">
            {statusBadge(c.status)}
            {(c.status === 'pendente_envio' || c.status === 'agendada' || c.status === 'enviando') && (
              <Button
                variant="ghost"
                className="text-red-600 hover:bg-red-50"
                onClick={() => cancelarCampanha.mutate(c.id)}
              >
                Cancelar
              </Button>
            )}
          </div>
        </div>
      ))}
    </Card>
  );
}
