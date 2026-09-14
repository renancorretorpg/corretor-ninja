import { useState } from 'react';
import { supabase } from '../supabaseClient';
import { Button, Card, Input } from './ui';

export function LoginPage() {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [erro, setErro] = useState('');
  const [aviso, setAviso] = useState('');
  const [enviando, setEnviando] = useState(false);

  async function entrar(e: React.FormEvent) {
    e.preventDefault();
    setErro('');
    setAviso('');
    setEnviando(true);
    const { error } = await supabase.auth.signInWithPassword({ email: email.trim(), password });
    setEnviando(false);
    if (error) {
      setErro(error.message === 'Invalid login credentials' ? 'E-mail ou senha incorretos.' : error.message);
    }
    // sucesso: onAuthStateChange no AuthContext cuida do resto
  }

  async function esqueciSenha() {
    setErro('');
    setAviso('');
    const alvo = email.trim();
    if (!alvo) {
      setErro('Digite seu e-mail acima primeiro.');
      return;
    }
    const { error } = await supabase.auth.resetPasswordForEmail(alvo);
    if (error) {
      setErro(error.message);
      return;
    }
    setAviso('Se esse e-mail tiver uma conta, mandamos um link pra redefinir a senha.');
  }

  return (
    <div className="flex min-h-screen items-center justify-center p-6">
      <Card className="w-full max-w-sm p-6">
        <p className="mb-1 text-xs font-semibold uppercase tracking-wide text-primary">Corretor Ninja</p>
        <h1 className="mb-1 text-xl font-semibold">Painel de leads</h1>
        <p className="mb-6 text-sm text-muted-foreground">Entre com o e-mail e a senha da sua conta.</p>

        <form onSubmit={entrar} className="space-y-3">
          <div>
            <label className="mb-1 block text-xs font-medium text-muted-foreground">E-mail</label>
            <Input
              type="email"
              autoComplete="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              required
            />
          </div>
          <div>
            <label className="mb-1 block text-xs font-medium text-muted-foreground">Senha</label>
            <Input
              type="password"
              autoComplete="current-password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              required
            />
          </div>

          {erro && <p className="text-sm text-red-600">{erro}</p>}
          {aviso && <p className="text-sm text-emerald-700">{aviso}</p>}

          <Button type="submit" className="w-full" disabled={enviando}>
            {enviando ? 'Entrando...' : 'Entrar'}
          </Button>
        </form>

        <button
          type="button"
          onClick={esqueciSenha}
          className="mt-4 text-xs text-muted-foreground underline-offset-2 hover:underline"
        >
          Esqueci minha senha
        </button>
      </Card>
    </div>
  );
}
