import { useMemo, useState } from 'react';
import {
  createColumnHelper,
  flexRender,
  getCoreRowModel,
  useReactTable,
  type SortingState,
} from '@tanstack/react-table';
import { useLeads } from '../api';
import type { Lead } from '../types';
import { Badge, Button, Select } from './ui';
import { formatData, formatTelefone, statusTone } from '../utils';

const columnHelper = createColumnHelper<Lead>();

interface ListaLeadsProps {
  status: string;
  origem: string;
  search: string;
  onSelectLead: (lead: Lead) => void;
}

export function ListaLeads({ status, origem, search, onSelectLead }: ListaLeadsProps) {
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(25);
  const [sorting, setSorting] = useState<SortingState>([{ id: 'created_at', desc: true }]);

  const sortBy = sorting[0]?.id ?? 'created_at';
  const sortDir = sorting[0]?.desc ? 'desc' : 'asc';

  const { data, isLoading, isError, error } = useLeads({
    page,
    pageSize,
    status: status || undefined,
    origem: origem || undefined,
    search: search || undefined,
    sortBy,
    sortDir,
  });

  const columns = useMemo(
    () => [
      columnHelper.accessor('nome', {
        header: 'Nome',
        cell: (info) => (
          <span className="font-medium">
            {info.getValue()} {info.row.original.sobrenome ?? ''}
          </span>
        ),
      }),
      columnHelper.accessor('numero', {
        header: 'Telefone',
        cell: (info) => formatTelefone(info.getValue()),
      }),
      columnHelper.accessor('status', {
        header: 'Etapa',
        cell: (info) => <Badge tone={statusTone(info.getValue())}>{info.getValue()}</Badge>,
      }),
      columnHelper.accessor('origem', {
        header: 'Imóvel de interesse',
        cell: (info) => info.getValue() ?? '—',
      }),
      columnHelper.accessor('updated_at', {
        header: 'Último contato',
        cell: (info) => formatData(info.getValue()),
      }),
      columnHelper.accessor('created_at', {
        header: 'Entrada',
        cell: (info) => formatData(info.getValue()),
      }),
    ],
    [],
  );

  const table = useReactTable({
    data: data?.data ?? [],
    columns,
    state: { sorting },
    onSortingChange: setSorting,
    getCoreRowModel: getCoreRowModel(),
    manualSorting: true,
    manualPagination: true,
  });

  const total = data?.total ?? 0;
  const totalPages = Math.max(1, Math.ceil(total / pageSize));

  if (isError) {
    return <p className="text-sm text-red-600">Erro ao carregar leads: {(error as Error).message}</p>;
  }

  return (
    <div className="space-y-3">
      <div className="overflow-x-auto rounded-lg border border-border">
        <table className="w-full text-sm">
          <thead className="bg-muted/50">
            {table.getHeaderGroups().map((headerGroup) => (
              <tr key={headerGroup.id}>
                {headerGroup.headers.map((header) => (
                  <th
                    key={header.id}
                    className="cursor-pointer select-none px-3 py-2 text-left font-medium text-muted-foreground"
                    onClick={header.column.getToggleSortingHandler()}
                  >
                    {flexRender(header.column.columnDef.header, header.getContext())}
                    {{ asc: ' ↑', desc: ' ↓' }[header.column.getIsSorted() as string] ?? ''}
                  </th>
                ))}
              </tr>
            ))}
          </thead>
          <tbody>
            {isLoading && (
              <tr>
                <td colSpan={columns.length} className="px-3 py-6 text-center text-muted-foreground">
                  Carregando...
                </td>
              </tr>
            )}
            {!isLoading && table.getRowModel().rows.length === 0 && (
              <tr>
                <td colSpan={columns.length} className="px-3 py-6 text-center text-muted-foreground">
                  Nenhum lead encontrado.
                </td>
              </tr>
            )}
            {table.getRowModel().rows.map((row) => (
              <tr
                key={row.id}
                className="cursor-pointer border-t border-border hover:bg-muted/30"
                onClick={() => onSelectLead(row.original)}
              >
                {row.getVisibleCells().map((cell) => (
                  <td key={cell.id} className="px-3 py-2">
                    {flexRender(cell.column.columnDef.cell, cell.getContext())}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <div className="flex items-center justify-between text-sm">
        <div className="flex items-center gap-2 text-muted-foreground">
          <span>
            {total} lead{total === 1 ? '' : 's'} · página {page} de {totalPages}
          </span>
          <Select value={pageSize} onChange={(e) => { setPageSize(Number(e.target.value)); setPage(1); }}>
            <option value={25}>25 por página</option>
            <option value={50}>50 por página</option>
            <option value={100}>100 por página</option>
          </Select>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" onClick={() => setPage((p) => Math.max(1, p - 1))} disabled={page <= 1}>
            Anterior
          </Button>
          <Button variant="outline" onClick={() => setPage((p) => Math.min(totalPages, p + 1))} disabled={page >= totalPages}>
            Próxima
          </Button>
        </div>
      </div>
    </div>
  );
}
