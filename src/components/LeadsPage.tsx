import { useState } from 'react';
import { ListaLeads } from './ListaLeads';
import { KanbanLeads } from './KanbanLeads';
import { Filtros } from './Filtros';
import { LeadDetailModal } from './LeadDetailModal';
import { Button } from './ui';
import type { Lead } from '../types';

type Modo = 'lista' | 'kanban';

const MODO_STORAGE_KEY = 'painel-leads:modo';

function getModoInicial(): Modo {
  const salvo = localStorage.getItem(MODO_STORAGE_KEY);
  return salvo === 'kanban' ? 'kanban' : 'lista';
}

export function LeadsPage() {
  const [modo, setModo] = useState<Modo>(getModoInicial);
  const [search, setSearch] = useState('');
  const [status, setStatus] = useState('');
  const [origem, setOrigem] = useState('');
  const [leadSelecionado, setLeadSelecionado] = useState<Lead | null>(null);

  function trocarModo(novoModo: Modo) {
    setModo(novoModo);
    localStorage.setItem(MODO_STORAGE_KEY, novoModo);
  }

  return (
    <div>
      <div className="mb-4 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <Filtros
          search={search}
          onSearchChange={setSearch}
          status={status}
          onStatusChange={setStatus}
          origem={origem}
          onOrigemChange={setOrigem}
        />
        <div className="flex gap-1 rounded-lg border border-border p-1">
          <Button
            className="flex-1 sm:flex-none"
            variant={modo === 'lista' ? 'default' : 'ghost'}
            onClick={() => trocarModo('lista')}
          >
            Lista
          </Button>
          <Button
            className="flex-1 sm:flex-none"
            variant={modo === 'kanban' ? 'default' : 'ghost'}
            onClick={() => trocarModo('kanban')}
          >
            Kanban
          </Button>
        </div>
      </div>

      {modo === 'lista' ? (
        <ListaLeads status={status} origem={origem} search={search} onSelectLead={setLeadSelecionado} />
      ) : (
        <KanbanLeads status={status} origem={origem} search={search} onSelectLead={setLeadSelecionado} />
      )}

      <LeadDetailModal lead={leadSelecionado} onClose={() => setLeadSelecionado(null)} />
    </div>
  );
}
