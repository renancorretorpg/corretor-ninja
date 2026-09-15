import { NavLink, Route, Routes } from 'react-router-dom';
import { LeadsPage } from './components/LeadsPage';
import { EtapasPage } from './components/EtapasPage';
import { CampanhasPage } from './components/CampanhasPage';
import { LoginPage } from './components/LoginPage';
import { AdminCorretoresPage } from './components/AdminCorretoresPage';
import { useAuth } from './AuthContext';
import { useMe } from './api';
import { Button } from './components/ui';

const linkBase = 'flex min-h-[44px] items-center rounded-md px-3 py-1.5 text-sm font-medium transition-colors';

export default function App() {
  const { session, loading, signOut } = useAuth();
  const { data: me } = useMe();

  if (loading) {
    return <div className="flex min-h-screen items-center justify-center text-sm text-muted-foreground">Carregando...</div>;
  }

  if (!session) {
    return <LoginPage />;
  }

  return (
    <div className="mx-auto max-w-6xl px-4 py-6">
      <header className="mb-6 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex items-center justify-between gap-3 sm:block">
          <div>
            <h1 className="text-xl font-semibold">Corretor Ninja</h1>
            <p className="text-sm text-muted-foreground">Painel</p>
          </div>
          <Button variant="ghost" className="sm:hidden" onClick={() => signOut()}>
            Sair
          </Button>
        </div>
        <nav className="flex flex-wrap gap-1 rounded-lg border border-border p-1">
          <NavLink
            to="/"
            end
            className={({ isActive }) =>
              `${linkBase} flex-1 justify-center sm:flex-none ${isActive ? 'bg-primary text-primary-foreground' : 'hover:bg-muted'}`
            }
          >
            Leads
          </NavLink>
          <NavLink
            to="/etapas"
            className={({ isActive }) =>
              `${linkBase} flex-1 justify-center sm:flex-none ${isActive ? 'bg-primary text-primary-foreground' : 'hover:bg-muted'}`
            }
          >
            Etapas
          </NavLink>
          <NavLink
            to="/campanhas"
            className={({ isActive }) =>
              `${linkBase} flex-1 justify-center sm:flex-none ${isActive ? 'bg-primary text-primary-foreground' : 'hover:bg-muted'}`
            }
          >
            Campanhas
          </NavLink>
          {me?.is_admin && (
            <NavLink
              to="/corretores"
              className={({ isActive }) =>
                `${linkBase} flex-1 justify-center sm:flex-none ${isActive ? 'bg-primary text-primary-foreground' : 'hover:bg-muted'}`
              }
            >
              Corretores
            </NavLink>
          )}
        </nav>
        <div className="hidden items-center gap-2 sm:flex">
          <span className="hidden text-xs text-muted-foreground md:inline">{session.user.email}</span>
          <Button variant="ghost" onClick={() => signOut()}>
            Sair
          </Button>
        </div>
      </header>

      <Routes>
        <Route path="/" element={<LeadsPage />} />
        <Route path="/etapas" element={<EtapasPage />} />
        <Route path="/campanhas" element={<CampanhasPage />} />
        <Route
          path="/corretores"
          element={
            me?.is_admin ? (
              <AdminCorretoresPage />
            ) : (
              <p className="text-sm text-muted-foreground">Essa página é restrita a administradores.</p>
            )
          }
        />
      </Routes>
    </div>
  );
}
