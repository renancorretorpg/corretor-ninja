import { useState } from 'react';
import { useParams } from 'react-router-dom';
import { useConviteValido, usePreencherConvite } from '../api';
import { Button, Card, Input } from './ui';

function estadoInicial() {
  return {
    nomeCorretor: '',
    whatsappNumero: '',
    email: '',
    senha: '',
    confirmarSenha: '',
    crmLogin: '',
    crmSenha: '',
    drivePastaTeasers: '',
  };
}

export function ConvitePage() {
  const { token = '' } = useParams();
  const { data, isLoading, isError } = useConviteValido(token);
  const preencher = usePreencherConvite(token);

  const [form, setForm] = useState(estadoInicial());
  const [erro, setErro] = useState('');
  const [enviado, setEnviado] = useState(false);

  function validar(): string | null {
    if (!form.nomeCorretor.trim()) return 'Preencha seu nome.';
    if (!form.whatsappNumero.trim()) return 'Preencha seu WhatsApp.';
    if (!form.email.trim()) return 'Preencha seu e-mail.';
    if (form.senha.length < 6) return 'A senha precisa ter pelo menos 6 caracteres.';
    if (form.senha !== form.confirmarSenha) return 'As senhas não conferem.';
    if (!form.crmLogin.trim()) return 'Preencha o login do Praedium.';
    if (!form.crmSenha) return 'Preencha a senha do Praedium.';
    return null;
  }

  function enviar() {
    const erroValidacao = validar();
    if (erroValidacao) {
      setErro(erroValidacao);
      return;
    }
    setErro('');
    preencher.mutate(
      {
        nome_corretor: form.nomeCorretor.trim(),
        whatsapp_numero: form.whatsappNumero.trim(),
        email: form.email.trim(),
        senha: form.senha,
        crm_login: form.crmLogin.trim(),
        crm_senha: form.crmSenha,
        drive_pasta_teasers: form.drivePastaTeasers.trim() || undefined,
      },
      {
        onSuccess: () => setEnviado(true),
        onError: (err) => setErro((err as Error).message),
      },
    );
  }

  if (isLoading) {
    return (
      <div className="flex min-h-screen items-center justify-center p-6">
        <p className="text-sm text-muted-foreground">Carregando...</p>
      </div>
    );
  }

  if (isError || !data?.valido) {
    return (
      <div className="flex min-h-screen items-center justify-center p-6">
        <Card className="w-full max-w-sm p-6 text-center">
          <p className="text-sm text-red-600">Esse link de convite não é mais válido.</p>
          <p className="mt-2 text-sm text-muted-foreground">Peça um novo link pra quem te convidou.</p>
        </Card>
      </div>
    );
  }

  if (enviado) {
    return (
      <div className="flex min-h-screen items-center justify-center p-6">
        <Card className="w-full max-w-sm p-6 text-center">
          <p className="text-sm font-medium text-emerald-700">✅ Cadastro enviado!</p>
          <p className="mt-2 text-sm text-muted-foreground">
            Seus dados foram recebidos. Assim que seu acesso for liberado, você poderá entrar no painel com o
            e-mail e a senha que acabou de criar.
          </p>
        </Card>
      </div>
    );
  }

  return (
    <div className="flex min-h-screen items-center justify-center p-6">
      <Card className="w-full max-w-lg p-6">
        <p className="mb-1 text-xs font-semibold uppercase tracking-wide text-primary">Corretor Ninja</p>
        <h1 className="mb-1 text-xl font-semibold">Complete seu cadastro</h1>
        <p className="mb-6 text-sm text-muted-foreground">
          Preencha seus dados abaixo. Seu acesso é liberado pelo administrador logo em seguida.
        </p>

        <div className="space-y-4">
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <div>
              <label className="mb-1 block text-xs font-medium text-muted-foreground">Seu nome</label>
              <Input value={form.nomeCorretor} onChange={(e) => setForm((f) => ({ ...f, nomeCorretor: e.target.value }))} />
            </div>
            <div>
              <label className="mb-1 block text-xs font-medium text-muted-foreground">Seu WhatsApp</label>
              <Input
                value={form.whatsappNumero}
                onChange={(e) => setForm((f) => ({ ...f, whatsappNumero: e.target.value }))}
                placeholder="13996113172 (com DDD)"
              />
            </div>
          </div>

          <div className="border-t border-border pt-4">
            <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground">Acesso ao painel</p>
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
              <div className="sm:col-span-2">
                <label className="mb-1 block text-xs font-medium text-muted-foreground">E-mail</label>
                <Input type="email" value={form.email} onChange={(e) => setForm((f) => ({ ...f, email: e.target.value }))} />
              </div>
              <div>
                <label className="mb-1 block text-xs font-medium text-muted-foreground">Senha</label>
                <Input
                  type="password"
                  value={form.senha}
                  onChange={(e) => setForm((f) => ({ ...f, senha: e.target.value }))}
                  placeholder="mínimo 6 caracteres"
                />
              </div>
              <div>
                <label className="mb-1 block text-xs font-medium text-muted-foreground">Confirmar senha</label>
                <Input
                  type="password"
                  value={form.confirmarSenha}
                  onChange={(e) => setForm((f) => ({ ...f, confirmarSenha: e.target.value }))}
                />
              </div>
            </div>
          </div>

          <div className="border-t border-border pt-4">
            <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground">Login do Praedium (CRM)</p>
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
              <div>
                <label className="mb-1 block text-xs font-medium text-muted-foreground">Login</label>
                <Input value={form.crmLogin} onChange={(e) => setForm((f) => ({ ...f, crmLogin: e.target.value }))} />
              </div>
              <div>
                <label className="mb-1 block text-xs font-medium text-muted-foreground">Senha</label>
                <Input type="password" value={form.crmSenha} onChange={(e) => setForm((f) => ({ ...f, crmSenha: e.target.value }))} />
              </div>
            </div>
          </div>

          <div className="border-t border-border pt-4">
            <label className="mb-1 block text-xs font-medium text-muted-foreground">ID da pasta de teasers no Google Drive (opcional)</label>
            <Input
              value={form.drivePastaTeasers}
              onChange={(e) => setForm((f) => ({ ...f, drivePastaTeasers: e.target.value }))}
              placeholder="cole aqui se já tiver essa pasta criada"
            />
          </div>

          {erro && <p className="text-sm text-red-600">{erro}</p>}

          <Button className="w-full" onClick={enviar} disabled={preencher.isPending}>
            {preencher.isPending ? 'Enviando...' : 'Enviar cadastro'}
          </Button>
        </div>
      </Card>
    </div>
  );
}
