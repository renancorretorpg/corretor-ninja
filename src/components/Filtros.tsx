import { Input, Select } from './ui';
import { useOrigens, useStatuses } from '../api';

interface FiltrosProps {
  search: string;
  onSearchChange: (v: string) => void;
  status: string;
  onStatusChange: (v: string) => void;
  origem: string;
  onOrigemChange: (v: string) => void;
}

export function Filtros({ search, onSearchChange, status, onStatusChange, origem, onOrigemChange }: FiltrosProps) {
  const { data: statusesData } = useStatuses();
  const { data: origensData } = useOrigens();

  return (
    <div className="flex flex-wrap items-center gap-2">
      <Input
        placeholder="Buscar por nome ou telefone..."
        value={search}
        onChange={(e) => onSearchChange(e.target.value)}
        className="max-w-xs"
      />
      <Select value={status} onChange={(e) => onStatusChange(e.target.value)}>
        <option value="">Todas as etapas</option>
        {statusesData?.statuses.map((s) => (
          <option key={s} value={s}>
            {s}
          </option>
        ))}
      </Select>
      <Select value={origem} onChange={(e) => onOrigemChange(e.target.value)}>
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
