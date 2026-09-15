import { useState } from 'react';
import { useCorretoresAdmin, useCreateCorretor } from '../api';
import { Badge, Button, Card, Input } from './ui';

function slugify(nome: string): string {
  return nome
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .trim()
    .split(/\s+/)[0]
    ?.replace(/[^a-zA-Z0-9]/g, '') || '';
}

function estadoInicial() {
  return {
    nomeCorretor: '',
    instance: '',
    instanceEditadaManualmente: false,
    whatsappNumero: '',
    email: '',
    senha: '',
    confirmarSenha: '',
    crmLogin: '',
    crmSenha: '',
  };
}

export function AdminCorretoresPage() {
  const { data, isLoading, isError, error } = useCorretoresAdmin();
  const createCorretor = useCreateCorretor();

  const [form, setForm] = useState(estadoInicial());
  const [erro, setErro] = useState('');
  const [resultado, setResultado] = useState<{ praedium: 'criado' | 'falhou'; praedium_erro: string | null } | null>(null);

  function atualizarNome(nome: string) {
    setForm((f) => ({
      ...f,
      nomeCorretor: nome,
      instance: f.instanceEditadaManualmente ? f.instance : slugify(nome),
    }));
  }

  function atualizarInstance(instance: string) {
    setForm((f) => ({ ...f, instance, instanceEditadaManualmente: true }));
  }

  function validar(): string | null {
    if (!form.nomeCorretor.trim()) return 'Preencha o nome do corretor.';
    if (!form.instance.trim()) return 'Preencha o identificador único.';
    if (!/^[a-zA-Z0-9_-]+$/.test(form.instance.trim())) return 'O identificador só pode ter letras, números, "-" e "_".';
    if (!form.whatsappNumero.trim()) return 'Preencha o WhatsApp do corretor.';
    if (!form.email.trim()) return 'Preencha o e-mail de acesso ao painel.';
    if (form.senha.length < 6) return 'A senha do painel precisa ter pelo menos 6 caracteres.';
    if (form.senha !== form.confirmarSenha) return 'As senhas do painel não conferem.';
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
    setResultado(null);
    createCorretor.mutate(
      {
        instance: form.instance.trim(),
        nome_corretor: form.nomeCorretor.trim(),
        email: form.email.trim(),
        senha: form.senha,
        whatsapp_numero: form.whatsappNumero.trim(),
        crm_login: form.crmLogin.trim(),
        crm_senha: form.crmSenha,
      },
      {
        onSuccess: (res) => {
          setResultado({ praedium: res.praedium, praedium_erro: res.praedium_erro });
          setForm(estadoInicial());
        },
        onError: (err) => setErro((err as Error).message),
      },
    );
  }

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-base font-semibold">Novo corretor</h2>
        <p className="mt-1 text-sm text-muted-foreground">
          Cria o acesso ao painel e envia o login do Praedium pro n8n, que guarda a senha criptografada.
          WhatsApp, Google Drive e Google Calendar desse corretor ainda precisam ser configurados à parte —
          ele entra inativo até isso ser feito.
        </p>
      </div>

      <Card className="max-w-2xl p-4">
        <div className="space-y-4">
          <div>
            <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground">Identificação</p>
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
              <div>
                <label className="mb-1 block text-xs font-medium text-muted-foreground">Nome do corretor</label>
                <Input value={form.nomeCorretor} onChange={(e) => atualizarNome(e.target.value)} placeholder="Renan Nascimento" />
              </div>
              <div>
                <label className="mb-1 block text-xs font-medium text-muted-foreground">Identificador único (instance)</label>
                <Input value={form.instance} onChange={(e) => atualizarInstance(e.target.value)} placeholder="renan" />
              </div>
            </div>
            <div className="mt-3">
              <label className="mb-1 block text-xs font-medium text-muted-foreground">WhatsApp do corretor</label>
              <Input
                value={form.whatsappNumero}
                onChange={(e) => setForm((f) => ({ ...f, whatsappNumero: e.target.value }))}
                placeholder="13996113172 (com DDD)"
                className="w-full sm:max-w-xs"
              />
            </div>
          </div>

          <div className="border-t border-border pt-4">
            <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground">Acesso ao painel</p>
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
              <div>
                <label className="mb-1 block text-xs font-medium text-muted-foreground">E-mail de login</label>
                <Input
                  type="email"
                  value={form.email}
                  onChange={(e) => setForm((f) => ({ ...f, email: e.target.value }))}
                  placeholder="corretor@email.com"
                />
              </div>
              <div />
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
                <Input
                  type="password"
                  value={form.crmSenha}
                  onChange={(e) => setForm((f) => ({ ...f, crmSenha: e.target.value }))}
                />
              </div>
            </div>
          </div>

          {erro && <p className="text-sm text-red-600">{erro}</p>}
          {resultado && (
            <p className={`text-sm ${resultado.praedium === 'criado' ? 'text-emerald-700' : 'text-amber-700'}`}>
              {resultado.praedium === 'criado'
                ? '✅ Corretor cadastrado — acesso ao painel e login do Praedium salvos com sucesso.'
                : `⚠️ Acesso ao painel criado, mas o login do Praedium não foi salvo (${resultado.praedium_erro}). Tente de novo pelo comando "CRM" no WhatsApp assim que o corretor estiver com o número conectado.`}
            </p>
          )}

          <div className="flex justify-end">
            <Button onClick={enviar} disabled={createCorretor.isPending}>
              {createCorretor.isPending ? 'Cadastrando...' : 'Cadastrar corretor'}
            </Button>
          </div>
        </div>
      </Card>

      <div>
        <h2 className="text-base font-semibold">Corretores com acesso</h2>
        {isError && <p className="mt-2 text-sm text-red-600">Erro ao carregar: {(error as Error).message}</p>}
        {isLoading ? (
          <p className="mt-2 text-sm text-muted-foreground">Carregando...</p>
        ) : (
          <Card className="mt-2 max-w-2xl">
            {(data?.data ?? []).map((c) => (
              <div key={c.instance} className="flex items-center justify-between gap-3 border-b border-border px-4 py-3 last:border-b-0">
                <div className="min-w-0">
                  <p className="text-sm font-medium">{c.instance}</p>
                  <p className="truncate text-xs text-muted-foreground">{c.email}</p>
                </div>
                {c.is_admin && <Badge tone="default">Admin</Badge>}
              </div>
            ))}
            {(data?.data ?? []).length === 0 && (
              <p className="px-4 py-6 text-center text-sm text-muted-foreground">Nenhum corretor cadastrado ainda.</p>
            )}
          </Card>
        )}
      </div>
    </div>
  );
}
