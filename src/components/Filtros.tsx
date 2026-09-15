import { Input, Select } from './ui';
import { useEtapas, useOrigens } from '../api';

interface FiltrosProps {
  search: string;
  onSearchChange: (v: string) => void;
  status: string;
  onStatusChange: (v: string) => void;
  origem: string;
  onOrigemChange: (v: string) => void;
}

export function Filtros({ search, onSearchChange, status, onStatusChange, origem, onOrigemChange }: FiltrosProps) {
  const { data: etapasData } = useEtapas();
  const { data: origensData } = useOrigens();

  return (
    <div className="flex flex-col gap-2 sm:flex-row sm:flex-wrap sm:items-center">
      <Input
        placeholder="Buscar por nome ou telefone..."
        value={search}
        onChange={(e) => onSearchChange(e.target.value)}
        className="w-full sm:max-w-xs"
      />
      <Select value={status} onChange={(e) => onStatusChange(e.target.value)} className="w-full sm:w-auto">
        <option value="">Todas as etapas</option>
        {etapasData?.data.map((e) => (
          <option key={e.id} value={e.nome}>
            {e.nome}
          </option>
        ))}
      </Select>
      <Select value={origem} onChange={(e) => onOrigemChange(e.target.value)} className="w-full sm:w-auto">
        <option value="">Todas as origens</option>
        {origensData?.origens.map((o) => (
          <option key={o} value={o}>
            {o}
          </option>
        ))}
      </Select>
    </div>
  );
}
