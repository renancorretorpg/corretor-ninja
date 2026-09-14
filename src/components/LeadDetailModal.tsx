import { useEffect, useState } from 'react';
import { useDeleteLead, useEtapas, useUpdateLead } from '../api';
import { formatDataHora } from '../utils';
import type { Lead } from '../types';
import { Button, Input, Modal, Select } from './ui';

export function LeadDetailModal({ lead, onClose }: { lead: Lead | null; onClose: () => void }) {
  const { data: etapasData } = useEtapas();
  const updateLead = useUpdateLead();
  const deleteLead = useDeleteLead();

  const [nome, setNome] = useState('');
  const [sobrenome, setSobrenome] = useState('');
  const [status, setStatus] = useState('');
  const [origem, setOrigem] = useState('');
  const [notas, setNotas] = useState('');

  useEffect(() => {
    if (lead) {
      setNome(lead.nome ?? '');
      setSobrenome(lead.sobrenome ?? '');
      setStatus(lead.status ?? '');
      setOrigem(lead.origem ?? '');
      setNotas(lead.notas ?? '');
    }
  }, [lead]);

  if (!lead) return null;

  const etapas = etapasData?.data ?? [];

  async function handleSalvar() {
    if (!lead) return;
    await updateLead.mutateAsync({
      id: lead.id,
      updates: { nome, sobrenome, status, origem, notas },
    });
    onClose();
  }

  function handleExcluir() {
    if (!lead) return;
    const confirmacao = window.prompt('Para excluir este lead, digite EXCLUIR:');
    if (confirmacao !== 'EXCLUIR') return;
    deleteLead.mutate(lead.id, { onSuccess: onClose });
  }

  return (
    <Modal open={!!lead} onClose={onClose} title={`${lead.nome} ${lead.sobrenome ?? ''}`.trim()} maxWidth="max-w-lg">
      <div className="space-y-3">
        <div className="flex justify-between text-xs text-muted-foreground">
          <span>Cadastrado em {formatDataHora(lead.created_at)}</span>
          <span>Atualizado em {formatDataHora(lead.updated_at)}</span>
        </div>

        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className="mb-1 block text-xs font-medium text-muted-foreground">Nome</label>
            <Input value={nome} onChange={(e) => setNome(e.target.value)} />
          </div>
          <div>
            <label className="mb-1 block text-xs font-medium text-muted-foreground">Sobrenome</label>
            <Input value={sobrenome} onChange={(e) => setSobrenome(e.target.value)} />
          </div>
        </div>

        <div className="grid grid-cols-2 gap-3">
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
            <Input value={origem} onChange={(e) => setOrigem(e.target.value)} />
          </div>
        </div>

        <div>
          <label className="mb-1 block text-xs font-medium text-muted-foreground">Notas</label>
          <textarea
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

        <div className="flex items-center justify-between pt-2">
          <Button
            variant="ghost"
            className="text-red-600 hover:bg-red-50"
            onClick={handleExcluir}
            disabled={deleteLead.isPending}
          >
            Excluir lead
          </Button>
          <div className="flex gap-2">
            <Button variant="outline" onClick={onClose}>
              Cancelar
            </Button>
            <Button onClick={handleSalvar} disabled={updateLead.isPending}>
              Salvar
            </Button>
          </div>
        </div>
      </div>
    </Modal>
  );
}
