import { useState } from 'react';
import { ListaLeads } from './components/ListaLeads';
import { KanbanLeads } from './components/KanbanLeads';
import { Filtros } from './components/Filtros';
import { Button } from './components/ui';

type Modo = 'lista' | 'kanban';

const MODO_STORAGE_KEY = 'painel-leads:modo';

function getModoInicial(): Modo {
  const salvo = localStorage.getItem(MODO_STORAGE_KEY);
  return salvo === 'kanban' ? 'kanban' : 'lista';
}

export default function App() {
  const [modo, setModo] = useState<Modo>(getModoInicial);
  const [search, setSearch] = useState('');
  const [status, setStatus] = useState('');
  const [origem, setOrigem] = useState('');

  function trocarModo(novoModo: Modo) {
    setModo(novoModo);
    localStorage.setItem(MODO_STORAGE_KEY, novoModo);
  }

  return (
    <div className="mx-auto max-w-6xl px-4 py-6">
      <header className="mb-6 flex items-center justify-between">
        <div>
          <h1 className="text-xl font-semibold">Leads</h1>
          <p className="text-sm text-muted-foreground">Corretor Ninja</p>
        </div>
        <div className="flex gap-1 rounded-lg border border-border p-1">
          <Button variant={modo === 'lista' ? 'default' : 'ghost'} onClick={() => trocarModo('lista')}>
            Lista
          </Button>
          <Button variant={modo === 'kanban' ? 'default' : 'ghost'} onClick={() => trocarModo('kanban')}>
            Kanban
          </Button>
        </div>
      </header>

      <div className="mb-4">
        <Filtros
          search={search}
          onSearchChange={setSearch}
          status={status}
          onStatusChange={setStatus}
          origem={origem}
          onOrigemChange={setOrigem}
        />
      </div>

      {modo === 'lista' ? (
        <ListaLeads status={status} origem={origem} search={search} />
      ) : (
        <KanbanLeads status={status} origem={origem} search={search} />
      )}
    </div>
  );
}
