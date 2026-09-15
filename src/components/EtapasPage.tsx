import { useEffect, useState } from 'react';
import {
  DndContext,
  PointerSensor,
  closestCenter,
  useSensor,
  useSensors,
  type DragEndEvent,
} from '@dnd-kit/core';
import {
  SortableContext,
  arrayMove,
  useSortable,
  verticalListSortingStrategy,
} from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import {
  useCreateEtapa,
  useDeleteEtapa,
  useEtapas,
  useReorderEtapas,
  useUpdateEtapa,
} from '../api';
import type { Etapa } from '../types';
import { Button, Card, Input, Modal, Select } from './ui';

const MAX_ETAPAS = 30;
const COR_PADRAO = '#3b82f6';

function EtapaRow({
  etapa,
  outrasEtapas,
}: {
  etapa: Etapa;
  outrasEtapas: Etapa[];
}) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({
    id: etapa.id,
  });
  const updateEtapa = useUpdateEtapa();
  const deleteEtapa = useDeleteEtapa();

  const [editando, setEditando] = useState(false);
  const [nome, setNome] = useState(etapa.nome);
  const [confirmando, setConfirmando] = useState(false);
  const [destino, setDestino] = useState('');
  const [erro, setErro] = useState('');

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
  };

  function salvarNome() {
    const valor = nome.trim();
    if (!valor || valor === etapa.nome) {
      setNome(etapa.nome);
      setEditando(false);
      return;
    }
    updateEtapa.mutate(
      { id: etapa.id, updates: { nome: valor } },
      {
        onError: (err) => setErro((err as Error).message),
        onSuccess: () => setEditando(false),
      },
    );
  }

  function trocarCor(cor: string) {
    updateEtapa.mutate({ id: etapa.id, updates: { cor } });
  }

  function pedirRemocao() {
    if (etapa.leadCount > 0) {
      setDestino(outrasEtapas[0]?.nome ?? '');
      setConfirmando(true);
    } else {
      deleteEtapa.mutate({ id: etapa.id });
    }
  }

  function confirmarRemocao() {
    deleteEtapa.mutate(
      { id: etapa.id, moveTo: destino },
      { onSuccess: () => setConfirmando(false), onError: (err) => setErro((err as Error).message) },
    );
  }

  return (
    <>
      <div
        ref={setNodeRef}
        style={style}
        className={`flex flex-wrap items-center gap-2 border-b border-border px-3 py-2 last:border-b-0 sm:flex-nowrap sm:gap-3 ${isDragging ? 'opacity-50' : ''}`}
      >
        <button
          type="button"
          className="flex h-11 w-8 shrink-0 cursor-grab touch-none items-center justify-center text-muted-foreground active:cursor-grabbing"
          {...attributes}
          {...listeners}
        >
          ⠿
        </button>
        <input
          type="color"
          value={etapa.cor ?? COR_PADRAO}
          onChange={(e) => trocarCor(e.target.value)}
          className="h-7 w-7 shrink-0 cursor-pointer rounded border border-border bg-transparent p-0"
          title="Cor da etapa"
        />
        {editando ? (
          <Input
            autoFocus
            value={nome}
            onChange={(e) => setNome(e.target.value)}
            onBlur={salvarNome}
            onKeyDown={(e) => {
              if (e.key === 'Enter') salvarNome();
              if (e.key === 'Escape') {
                setNome(etapa.nome);
                setEditando(false);
              }
            }}
            className="min-w-[120px] flex-1 sm:max-w-xs"
          />
        ) : (
          <button
            type="button"
            className="min-w-[100px] flex-1 truncate text-left text-sm font-medium hover:underline"
            onClick={() => setEditando(true)}
          >
            {etapa.nome}
          </button>
        )}
        <span className="order-1 shrink-0 text-xs text-muted-foreground sm:order-none">
          {etapa.leadCount} {etapa.leadCount === 1 ? 'lead' : 'leads'}
        </span>
        <Button
          variant="ghost"
          onClick={pedirRemocao}
          className="order-2 shrink-0 text-red-600 hover:bg-red-50 sm:order-none"
        >
          Remover
        </Button>
      </div>
      {erro && <p className="px-3 pb-1 text-xs text-red-600">{erro}</p>}

      <Modal open={confirmando} onClose={() => setConfirmando(false)} title={`Remover "${etapa.nome}"`}>
        <p className="mb-3 text-sm text-muted-foreground">
          Essa etapa tem {etapa.leadCount} lead(s). Pra onde eles devem ir antes de remover a etapa?
        </p>
        {outrasEtapas.length === 0 ? (
          <p className="text-sm text-red-600">
            Não há outra etapa pra mover esses leads. Crie outra etapa primeiro.
          </p>
        ) : (
          <>
            <Select value={destino} onChange={(e) => setDestino(e.target.value)} className="w-full">
              {outrasEtapas.map((e) => (
                <option key={e.id} value={e.nome}>
                  {e.nome}
                </option>
              ))}
            </Select>
            <div className="mt-3 flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
              <Button variant="outline" onClick={() => setConfirmando(false)}>
                Cancelar
              </Button>
              <Button onClick={confirmarRemocao} disabled={deleteEtapa.isPending}>
                Mover e remover
              </Button>
            </div>
          </>
        )}
      </Modal>
    </>
  );
}

export function EtapasPage() {
  const { data, isLoading, isError, error } = useEtapas();
  const createEtapa = useCreateEtapa();
  const reorderEtapas = useReorderEtapas();

  const [novoNome, setNovoNome] = useState('');
  const [erroNovo, setErroNovo] = useState('');
  const [etapasOrdenadas, setEtapasOrdenadas] = useState<Etapa[]>([]);

  useEffect(() => {
    if (data?.data) setEtapasOrdenadas(data.data);
  }, [data]);

  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 5 } }));

  function handleDragEnd(event: DragEndEvent) {
    const { active, over } = event;
    if (!over || active.id === over.id) return;
    const oldIndex = etapasOrdenadas.findIndex((e) => e.id === active.id);
    const newIndex = etapasOrdenadas.findIndex((e) => e.id === over.id);
    const nova = arrayMove(etapasOrdenadas, oldIndex, newIndex);
    setEtapasOrdenadas(nova);
    reorderEtapas.mutate(nova.map((e, i) => ({ id: e.id, ordem: i + 1 })));
  }

  function adicionarEtapa() {
    const nome = novoNome.trim();
    if (!nome) return;
    setErroNovo('');
    createEtapa.mutate(
      { nome },
      {
        onSuccess: () => setNovoNome(''),
        onError: (err) => setErroNovo((err as Error).message),
      },
    );
  }

  if (isError) {
    return <p className="text-sm text-red-600">Erro ao carregar etapas: {(error as Error).message}</p>;
  }

  const atingiuLimite = etapasOrdenadas.length >= MAX_ETAPAS;

  return (
    <div>
      <p className="mb-4 text-sm text-muted-foreground">
        Essas etapas definem as colunas do Kanban e os filtros da página de Leads. Arraste para reordenar.
      </p>

      <div className="mb-4 flex flex-col gap-2 sm:flex-row sm:flex-wrap sm:items-center">
        <Input
          placeholder="Nome da nova etapa..."
          value={novoNome}
          onChange={(e) => setNovoNome(e.target.value)}
          onKeyDown={(e) => e.key === 'Enter' && adicionarEtapa()}
          disabled={atingiuLimite}
          className="w-full sm:max-w-xs"
        />
        <Button onClick={adicionarEtapa} disabled={atingiuLimite || createEtapa.isPending}>
          Adicionar etapa
        </Button>
        {atingiuLimite && (
          <span className="text-xs text-muted-foreground">Limite de {MAX_ETAPAS} etapas atingido.</span>
        )}
      </div>
      {erroNovo && <p className="mb-2 text-xs text-red-600">{erroNovo}</p>}

      {isLoading ? (
        <p className="text-sm text-muted-foreground">Carregando...</p>
      ) : etapasOrdenadas.length === 0 ? (
        <p className="text-sm text-muted-foreground">Nenhuma etapa cadastrada ainda.</p>
      ) : (
        <Card>
          <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={handleDragEnd}>
            <SortableContext
              items={etapasOrdenadas.map((e) => e.id)}
              strategy={verticalListSortingStrategy}
            >
              {etapasOrdenadas.map((etapa) => (
                <EtapaRow
                  key={etapa.id}
                  etapa={etapa}
                  outrasEtapas={etapasOrdenadas.filter((e) => e.id !== etapa.id)}
                />
              ))}
            </SortableContext>
          </DndContext>
        </Card>
      )}
    </div>
  );
}
