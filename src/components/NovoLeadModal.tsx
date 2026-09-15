import { useState } from 'react';
import { useCreateLead, useEtapas } from '../api';
import { Button, Input, Modal, Select } from './ui';

export function NovoLeadModal({ open, onClose }: { open: boolean; onClose: () => void }) {
  const { data: etapasData } = useEtapas();
  const createLead = useCreateLead();

  const [nome, setNome] = useState('');
  const [sobrenome, setSobrenome] = useState('');
  const [numero, setNumero] = useState('');
  const [status, setStatus] = useState('');
  const [origem, setOrigem] = useState('');
  const [notas, setNotas] = useState('');
  const [erro, setErro] = useState<string | null>(null);

  const etapas = etapasData?.data ?? [];

  function limpar() {
    setNome('');
    setSobrenome('');
    setNumero('');
    setStatus('');
    setOrigem('');
    setNotas('');
    setErro(null);
  }

  function fechar() {
    limpar();
    onClose();
  }

  async function handleSalvar() {
    setErro(null);
    try {
      await createLead.mutateAsync({
        nome,
        sobrenome: sobrenome || undefined,
        numero,
        status: status || undefined,
        origem: origem || undefined,
        notas: notas || undefined,
      });
      fechar();
    } catch (err) {
      setErro((err as Error).message);
    }
  }

  return (
    <Modal open={open} onClose={fechar} title="Novo lead" maxWidth="max-w-lg">
      <div className="space-y-3">
        {erro && <p className="text-sm text-red-600">{erro}</p>}

        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          <div>
            <label className="mb-1 block text-xs font-medium text-muted-foreground">Nome</label>
            <Input value={nome} onChange={(e) => setNome(e.target.value)} autoFocus />
          </div>
          <div>
            <label className="mb-1 block text-xs font-medium text-muted-foreground">Sobrenome</label>
            <Input value={sobrenome} onChange={(e) => setSobrenome(e.target.value)} />
          </div>
        </div>

        <div>
          <label className="mb-1 block text-xs font-medium text-muted-foreground">Telefone</label>
          <Input value={numero} onChange={(e) => setNumero(e.target.value)} placeholder="5511999999999" />
        </div>

        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          <div>
            <label className="mb-1 block text-xs font-medium text-muted-foreground">Etapa</label>
            <Select value={status} onChange={(e) => setStatus(e.target.value)} className="w-full">
              <option value="">Selecione...</option>
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

        <div className="grid grid-cols-2 gap-2 pt-2 sm:flex sm:justify-end">
          <Button variant="outline" onClick={fechar}>
            Cancelar
          </Button>
          <Button onClick={handleSalvar} disabled={createLead.isPending || !nome.trim() || !numero.trim()}>
            Salvar
          </Button>
        </div>
      </div>
    </Modal>
  );
}
