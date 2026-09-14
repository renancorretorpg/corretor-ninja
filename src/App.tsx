import { NavLink, Route, Routes } from 'react-router-dom';
import { LeadsPage } from './components/LeadsPage';
import { EtapasPage } from './components/EtapasPage';
import { CampanhasPage } from './components/CampanhasPage';
import { LoginPage } from './components/LoginPage';
import { useAuth } from './AuthContext';
import { Button } from './components/ui';

const linkBase = 'rounded-md px-3 py-1.5 text-sm font-medium transition-colors';

export default function App() {
  const { session, loading, signOut } = useAuth();

  if (loading) {
    return <div className="flex min-h-screen items-center justify-center text-sm text-muted-foreground">Carregando...</div>;
  }

  if (!session) {
    return <LoginPage />;
  }

  return (
    <div className="mx-auto max-w-6xl px-4 py-6">
      <header className="mb-6 flex items-center justify-between gap-3">
        <div>
          <h1 className="text-xl font-semibold">Corretor Ninja</h1>
          <p className="text-sm text-muted-foreground">Painel</p>
        </div>
        <nav className="flex gap-1 rounded-lg border border-border p-1">
          <NavLink
            to="/"
            end
            className={({ isActive }) =>
              `${linkBase} ${isActive ? 'bg-primary text-primary-foreground' : 'hover:bg-muted'}`
            }
          >
            Leads
          </NavLink>
          <NavLink
            to="/etapas"
            className={({ isActive }) =>
              `${linkBase} ${isActive ? 'bg-primary text-primary-foreground' : 'hover:bg-muted'}`
            }
          >
            Etapas
          </NavLink>
          <NavLink
            to="/campanhas"
            className={({ isActive }) =>
              `${linkBase} ${isActive ? 'bg-primary text-primary-foreground' : 'hover:bg-muted'}`
            }
          >
            Campanhas
          </NavLink>
        </nav>
        <div className="flex items-center gap-2">
          <span className="hidden text-xs text-muted-foreground sm:inline">{session.user.email}</span>
          <Button variant="ghost" onClick={() => signOut()}>
            Sair
          </Button>
        </div>
      </header>

      <Routes>
        <Route path="/" element={<LeadsPage />} />
        <Route path="/etapas" element={<EtapasPage />} />
        <Route path="/campanhas" element={<CampanhasPage />} />
      </Routes>
    </div>
  );
}
