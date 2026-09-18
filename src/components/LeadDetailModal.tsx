import { useEffect, useState } from 'react';
import { useDeleteLead, useEtapas, useUpdateLead } from '../api';
import { MSG_TELEFONE_INVALIDO, formatDataHora, telefoneValido } from '../utils';
import type { Lead } from '../types';
import { Button, Input, Modal, Select } from './ui';

export function LeadDetailModal({ lead, onClose }: { lead: Lead | null; onClose: () => void }) {
  const { data: etapasData } = useEtapas();
  const updateLead = useUpdateLead();
  const deleteLead = useDeleteLead();

  const [nome, setNome] = useState('');
  const [sobrenome, setSobrenome] = useState('');
  const [numero, setNumero] = useState('');
  const [status, setStatus] = useState('');
  const [origem, setOrigem] = useState('');
  const [notas, setNotas] = useState('');
  const [confirmandoExclusao, setConfirmandoExclusao] = useState(false);
  const [textoExclusao, setTextoExclusao] = useState('');
  const [erro, setErro] = useState<string | null>(null);

  useEffect(() => {
    if (lead) {
      setNome(lead.nome ?? '');
      setSobrenome(lead.sobrenome ?? '');
      setNumero(lead.numero ?? '');
      setStatus(lead.status ?? '');
      setOrigem(lead.origem ?? '');
      setNotas(lead.notas ?? '');
      setConfirmandoExclusao(false);
      setTextoExclusao('');
      setErro(null);
    }
  }, [lead]);

  if (!lead) return null;

  const etapas = etapasData?.data ?? [];
  const numeroAlterado = numero !== (lead.numero ?? '');
  const telefoneOk = !numeroAlterado || telefoneValido(numero);
  const podeSalvar = !!nome.trim() && telefoneOk;

  async function handleSalvar() {
    if (!lead) return;
    setErro(null);
    if (!nome.trim()) {
      setErro('Nome é obrigatório.');
      return;
    }
    if (!telefoneOk) {
      setErro(MSG_TELEFONE_INVALIDO);
      return;
    }
    try {
      await updateLead.mutateAsync({
        id: lead.id,
        updates: {
          nome: nome.trim(),
          sobrenome: sobrenome.trim(),
          ...(numeroAlterado ? { numero } : {}),
          status,
          origem: origem.trim(),
          notas,
        },
      });
      onClose();
    } catch (err) {
      setErro((err as Error).message);
    }
  }

  function confirmarExclusao() {
    if (!lead || textoExclusao !== 'EXCLUIR') return;
    deleteLead.mutate(lead.id, { onSuccess: onClose });
  }

  if (confirmandoExclusao) {
    return (
      <Modal open={!!lead} onClose={onClose} title={`Excluir ${lead.nome}?`} maxWidth="max-w-lg">
        <div className="space-y-3">
          <p className="text-sm text-muted-foreground">
            Essa ação não pode ser desfeita. Pra confirmar, digite <strong>EXCLUIR</strong> abaixo.
          </p>
          <Input
            value={textoExclusao}
            onChange={(e) => setTextoExclusao(e.target.value)}
            placeholder="EXCLUIR"
            autoFocus
          />
          <div className="flex flex-col-reverse gap-2 pt-2 sm:flex-row sm:justify-end">
            <Button variant="outline" onClick={() => setConfirmandoExclusao(false)}>
              Voltar
            </Button>
            <Button
              className="bg-red-600 text-white hover:opacity-90"
              onClick={confirmarExclusao}
              disabled={textoExclusao !== 'EXCLUIR' || deleteLead.isPending}
            >
              Excluir lead
            </Button>
          </div>
        </div>
      </Modal>
    );
  }

  return (
    <Modal open={!!lead} onClose={onClose} title={`${lead.nome} ${lead.sobrenome ?? ''}`.trim()} maxWidth="max-w-lg">
      <div className="space-y-3">
        <div className="flex justify-between text-xs text-muted-foreground">
          <span>Cadastrado em {formatDataHora(lead.created_at)}</span>
          <span>Atualizado em {formatDataHora(lead.updated_at)}</span>
        </div>

        {erro && <p className="text-sm text-red-600">{erro}</p>}

        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          <div>
            <label className="mb-1 block text-xs font-medium text-muted-foreground">Nome</label>
            <Input value={nome} onChange={(e) => setNome(e.target.value)} maxLength={120} />
          </div>
          <div>
            <label className="mb-1 block text-xs font-medium text-muted-foreground">Sobrenome</label>
            <Input value={sobrenome} onChange={(e) => setSobrenome(e.target.value)} maxLength={120} />
          </div>
        </div>

        <div>
          <label className="mb-1 block text-xs font-medium text-muted-foreground">Telefone</label>
          <Input
            value={numero}
            onChange={(e) => setNumero(e.target.value)}
            placeholder="5511999999999"
            inputMode="tel"
            maxLength={25}
          />
          {numero.trim() && !telefoneOk && <p className="mt-1 text-xs text-red-600">{MSG_TELEFONE_INVALIDO}</p>}
        </div>

        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          <div>
            <label className="mb-1 block text-xs font-medium text-muted-foreground">Etapa</label>
            <Select value={status} onChange={(e) => setStatus(e.target.value)} className="w-full">
              {!etapas.some((et) => et.nome === status) && status && (
                <option value={status}>{status}</option>
              )}
              {etapas.map((et) => (
                <option key={et.id} value={et.nome}>
                  {et.nome}
                </option>
              ))}
            </Select>
          </div>
          <div>
            <label className="mb-1 block text-xs font-medium text-muted-foreground">Imóvel de interesse</label>
            <Input value={origem} onChange={(e) => setOrigem(e.target.value)} maxLength={200} />
          </div>
        </div>

        <div>
          <label className="mb-1 block text-xs font-medium text-muted-foreground">Notas</label>
          <textarea
            maxLength={5000}
            className="min-h-[80px] w-full rounded-md border border-border bg-background px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-primary/30"
            value={notas}
            onChange={(e) => setNotas(e.target.value)}
          />
        </div>

        <div>
          <label className="mb-1 block text-xs font-medium text-muted-foreground">Histórico de conversa</label>
          {lead.historico_conversa?.resumo ? (
            <div className="rounded-md border border-border bg-muted/40 p-3 text-sm">
              <p className="whitespace-pre-wrap">{lead.historico_conversa.resumo}</p>
              {lead.historico_conversa.atualizado_em && (
                <p className="mt-2 text-xs text-muted-foreground">
                  Atualizado em {formatDataHora(lead.historico_conversa.atualizado_em)}
                  {lead.historico_conversa.periodo_dias
                    ? ` · últimos ${lead.historico_conversa.periodo_dias} dias`
                    : ''}
                </p>
              )}
            </div>
          ) : (
            <p className="text-sm text-muted-foreground">
              Ainda não processamos o histórico de conversa desse lead.
            </p>
          )}
        </div>

        <div className="flex flex-col-reverse gap-2 pt-2 sm:flex-row sm:items-center sm:justify-between">
          <Button
            variant="ghost"
            className="text-red-600 hover:bg-red-50"
            onClick={() => setConfirmandoExclusao(true)}
            disabled={deleteLead.isPending}
          >
            Excluir lead
          </Button>
          <div className="grid grid-cols-2 gap-2 sm:flex">
            <Button variant="outline" onClick={onClose}>
              Cancelar
            </Button>
            <Button onClick={handleSalvar} disabled={updateLead.isPending || !podeSalvar}>
              Salvar
            </Button>
          </div>
        </div>
      </div>
    </Modal>
  );
}
