import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { supabase } from '../supabaseClient';
import { Button, Card, Input } from './ui';

export function RedefinirSenhaPage() {
  const navigate = useNavigate();
  const [pronto, setPronto] = useState(false);
  const [erroLink, setErroLink] = useState('');
  const [senha, setSenha] = useState('');
  const [confirmarSenha, setConfirmarSenha] = useState('');
  const [erro, setErro] = useState('');
  const [sucesso, setSucesso] = useState(false);
  const [enviando, setEnviando] = useState(false);

  useEffect(() => {
    const hash = window.location.hash.startsWith('#') ? window.location.hash.slice(1) : window.location.hash;
    const params = new URLSearchParams(hash);
    const accessToken = params.get('access_token');
    const refreshToken = params.get('refresh_token');
    const type = params.get('type');

    if (!accessToken || !refreshToken || type !== 'recovery') {
      setErroLink('Esse link de redefinição de senha é inválido ou já expirou. Peça um novo em "Esqueci minha senha".');
      return;
    }

    supabase.auth.setSession({ access_token: accessToken, refresh_token: refreshToken }).then(({ error }) => {
      if (error) {
        setErroLink('Esse link de redefinição de senha é inválido ou já expirou. Peça um novo em "Esqueci minha senha".');
        return;
      }
      window.history.replaceState(null, '', window.location.pathname);
      setPronto(true);
    });
  }, []);

  async function redefinir(e: React.FormEvent) {
    e.preventDefault();
    setErro('');
    if (senha.length < 6) {
      setErro('A senha precisa ter pelo menos 6 caracteres.');
      return;
    }
    if (senha !== confirmarSenha) {
      setErro('As senhas não coincidem.');
      return;
    }
    setEnviando(true);
    const { error } = await supabase.auth.updateUser({ password: senha });
    setEnviando(false);
    if (error) {
      setErro(error.message);
      return;
    }
    setSucesso(true);
    setTimeout(() => navigate('/'), 2000);
  }

  return (
    <div className="flex min-h-screen items-center justify-center p-6">
      <Card className="w-full max-w-sm p-6">
        <p className="mb-1 text-xs font-semibold uppercase tracking-wide text-primary">Corretor Ninja</p>
        <h1 className="mb-6 text-xl font-semibold">Redefinir senha</h1>

        {erroLink && <p className="text-sm text-red-600">{erroLink}</p>}

        {!erroLink && !pronto && <p className="text-sm text-muted-foreground">Confirmando o link...</p>}

        {pronto && !sucesso && (
          <form onSubmit={redefinir} className="space-y-3">
            <div>
              <label className="mb-1 block text-xs font-medium text-muted-foreground">Nova senha</label>
              <Input
                type="password"
                autoComplete="new-password"
                value={senha}
                onChange={(e) => setSenha(e.target.value)}
                required
              />
            </div>
            <div>
              <label className="mb-1 block text-xs font-medium text-muted-foreground">Confirmar nova senha</label>
              <Input
                type="password"
                autoComplete="new-password"
                value={confirmarSenha}
                onChange={(e) => setConfirmarSenha(e.target.value)}
                required
              />
            </div>

            {erro && <p className="text-sm text-red-600">{erro}</p>}

            <Button type="submit" className="w-full" disabled={enviando}>
              {enviando ? 'Salvando...' : 'Salvar nova senha'}
            </Button>
          </form>
        )}

        {sucesso && <p className="text-sm text-emerald-700">Senha alterada! Redirecionando para o painel...</p>}
      </Card>
    </div>
  );
}
