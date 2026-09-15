import { useEffect, useMemo, useState } from 'react';
import {
  DndContext,
  DragOverlay,
  PointerSensor,
  useDroppable,
  useSensor,
  useSensors,
  type DragEndEvent,
  type DragStartEvent,
} from '@dnd-kit/core';
import { useDraggable } from '@dnd-kit/core';
import { useAllLeadsForKanban, useEtapas, useUpdateLead } from '../api';
import type { Etapa, Lead } from '../types';
import { Card } from './ui';
import { formatTelefone } from '../utils';

interface KanbanLeadsProps {
  status: string;
  origem: string;
  search: string;
  onSelectLead: (lead: Lead) => void;
}

function LeadCard({ lead, onSelectLead }: { lead: Lead; onSelectLead: (lead: Lead) => void }) {
  const { attributes, listeners, setNodeRef, transform, isDragging } = useDraggable({
    id: lead.id,
    data: { lead },
  });

  const style = transform
    ? { transform: `translate3d(${transform.x}px, ${transform.y}px, 0)` }
    : undefined;

  return (
    <div
      ref={setNodeRef}
      style={style}
      {...listeners}
      {...attributes}
      onClick={() => onSelectLead(lead)}
      className={`cursor-grab active:cursor-grabbing ${isDragging ? 'opacity-40' : ''}`}
    >
      <Card className="mb-2 p-3">
        <p className="text-sm font-medium">
          {lead.nome} {lead.sobrenome ?? ''}
        </p>
        <p className="text-xs text-muted-foreground">{formatTelefone(lead.numero)}</p>
        {lead.origem && <p className="mt-1 text-xs text-muted-foreground">Imóvel: {lead.origem}</p>}
      </Card>
    </div>
  );
}

function Coluna({
  etapa,
  leads,
  onSelectLead,
  ativaNoMobile,
}: {
  etapa: Etapa | { nome: string; cor: string | null };
  leads: Lead[];
  onSelectLead: (lead: Lead) => void;
  ativaNoMobile: boolean;
}) {
  const { setNodeRef, isOver } = useDroppable({ id: etapa.nome });

  return (
    <div
      ref={setNodeRef}
      className={`${ativaNoMobile ? 'flex' : 'hidden'} w-full flex-col rounded-lg border border-border bg-muted/30 p-3 md:flex md:w-72 md:shrink-0 ${isOver ? 'ring-2 ring-primary/40' : ''}`}
    >
      <div className="mb-2 flex items-center justify-between">
        <h3 className="flex items-center gap-2 text-sm font-semibold">
          <span
            className="h-2.5 w-2.5 rounded-full"
            style={{ backgroundColor: etapa.cor ?? '#94a3b8' }}
          />
          {etapa.nome}
        </h3>
        <span className="text-xs text-muted-foreground">{leads.length}</span>
      </div>
      <div className="min-h-[80px] flex-1">
        {leads.map((lead) => (
          <LeadCard key={lead.id} lead={lead} onSelectLead={onSelectLead} />
        ))}
      </div>
    </div>
  );
}

export function KanbanLeads({ status, origem, search, onSelectLead }: KanbanLeadsProps) {
  const [activeLead, setActiveLead] = useState<Lead | null>(null);
  const [colunaAtivaMobile, setColunaAtivaMobile] = useState<string | null>(null);
  const { data, isLoading, isError, error } = useAllLeadsForKanban({
    status: status || undefined,
    origem: origem || undefined,
    search: search || undefined,
  });
  const { data: etapasData } = useEtapas();
  const updateLead = useUpdateLead();

  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 5 } }));

  const colunas = useMemo(() => {
    const etapas = etapasData?.data ?? [];
    const map = new Map<string, { etapa: Etapa | { nome: string; cor: string | null }; leads: Lead[] }>();
    for (const etapa of etapas) map.set(etapa.nome, { etapa, leads: [] });
    for (const lead of data?.data ?? []) {
      if (!map.has(lead.status)) map.set(lead.status, { etapa: { nome: lead.status, cor: null }, leads: [] });
      map.get(lead.status)!.leads.push(lead);
    }
    return Array.from(map.values());
  }, [data, etapasData]);

  // No celular so uma coluna fica visivel por vez (troca pela aba), entao
  // sempre precisa ter uma selecionada -- reseta pra primeira se a atual
  // sumiu (etapa excluida/renomeada) ou ainda nao tem nenhuma escolhida.
  useEffect(() => {
    if (colunas.length === 0) return;
    if (!colunaAtivaMobile || !colunas.some(({ etapa }) => etapa.nome === colunaAtivaMobile)) {
      setColunaAtivaMobile(colunas[0].etapa.nome);
    }
  }, [colunas, colunaAtivaMobile]);

  function handleDragStart(event: DragStartEvent) {
    setActiveLead((event.active.data.current?.lead as Lead) ?? null);
  }

  function handleDragEnd(event: DragEndEvent) {
    setActiveLead(null);
    const { active, over } = event;
    if (!over) return;
    const novoStatus = String(over.id);
    const lead = active.data.current?.lead as Lead | undefined;
    if (!lead || lead.status === novoStatus) return;
    updateLead.mutate({ id: lead.id, updates: { status: novoStatus } });
  }

  if (isError) {
    return <p className="text-sm text-red-600">Erro ao carregar leads: {(error as Error).message}</p>;
  }
  if (isLoading) {
    return <p className="text-sm text-muted-foreground">Carregando...</p>;
  }

  return (
    <DndContext sensors={sensors} onDragStart={handleDragStart} onDragEnd={handleDragEnd}>
      <div className="-mx-4 mb-3 flex snap-x snap-mandatory gap-2 overflow-x-auto px-4 pb-1 md:hidden">
        {colunas.map(({ etapa, leads }) => (
          <button
            key={etapa.nome}
            onClick={() => setColunaAtivaMobile(etapa.nome)}
            className={`flex shrink-0 snap-start items-center gap-2 rounded-full border px-3 py-1.5 text-sm font-medium transition-colors ${
              etapa.nome === colunaAtivaMobile
                ? 'border-primary bg-primary text-primary-foreground'
                : 'border-border bg-background text-foreground'
            }`}
          >
            <span className="h-2 w-2 shrink-0 rounded-full" style={{ backgroundColor: etapa.cor ?? '#94a3b8' }} />
            {etapa.nome}
            <span className={etapa.nome === colunaAtivaMobile ? 'opacity-80' : 'text-muted-foreground'}>
              {leads.length}
            </span>
          </button>
        ))}
      </div>

      <div className="flex flex-col gap-3 pb-2 md:flex-row md:overflow-x-auto">
        {colunas.map(({ etapa, leads }) => (
          <Coluna
            key={etapa.nome}
            etapa={etapa}
            leads={leads}
            onSelectLead={onSelectLead}
            ativaNoMobile={etapa.nome === colunaAtivaMobile}
          />
        ))}
      </div>
      <DragOverlay>{activeLead ? <LeadCard lead={activeLead} onSelectLead={() => {}} /> : null}</DragOverlay>
    </DndContext>
  );
}
