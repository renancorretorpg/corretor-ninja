import { useState } from 'react';
import {
  useConvitesAdmin,
  useCorretoresAdmin,
  useCreateConvite,
  useCreateCorretor,
  useDeleteConvite,
  useFinalizarConvite,
} from '../api';
import type { Convite } from '../types';
import { Badge, Button, Card, Input } from './ui';

function slugify(nome: string): string {
  return (
    nome
      .normalize('NFD')
      .replace(/[̀-ͯ]/g, '')
      .trim()
      .split(/\s+/)[0]
      ?.replace(/[^a-zA-Z0-9]/g, '') || ''
  );
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
    drivePastaTeasers: '',
  };
}

function ConviteRow({ convite }: { convite: Convite }) {
  const finalizar = useFinalizarConvite();
  const deletar = useDeleteConvite();
  const [instance, setInstance] = useState(slugify(convite.nome_corretor || ''));
  const [erro, setErro] = useState('');
  const [resultado, setResultado] = useState<{ praedium: 'criado' | 'falhou'; praedium_erro: string | null } | null>(null);
  const [copiado, setCopiado] = useState(false);

  function copiarLink() {
    navigator.clipboard?.writeText(convite.url).then(() => {
      setCopiado(true);
      setTimeout(() => setCopiado(false), 2000);
    });
  }

  function finalizarConvite() {
    if (!instance.trim()) {
      setErro('Informe o identificador único.');
      return;
    }
    if (!/^[a-zA-Z0-9_-]+$/.test(instance.trim())) {
      setErro('O identificador só pode ter letras, números, "-" e "_".');
      return;
    }
    setErro('');
    finalizar.mutate(
      { id: convite.id, instance: instance.trim() },
      {
        onSuccess: (res) => setResultado({ praedium: res.praedium, praedium_erro: res.praedium_erro }),
        onError: (err) => setErro((err as Error).message),
      },
    );
  }

  return (
    <div className="border-b border-border px-4 py-3 last:border-b-0">
      <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
        <div className="min-w-0">
          {convite.status === 'pendente' ? (
            <p className="text-sm text-muted-foreground">Aguardando o corretor preencher...</p>
          ) : (
            <>
              <p className="text-sm font-medium">{convite.nome_corretor}</p>
              <p className="truncate text-xs text-muted-foreground">
                {convite.email} · {convite.whatsapp_numero}
              </p>
            </>
          )}
        </div>
        <div className="flex items-center gap-2">
          <Badge tone={convite.status === 'preenchido' ? 'warning' : 'muted'}>
            {convite.status === 'pendente' ? 'Link enviado' : 'Aguardando aprovação'}
          </Badge>
          {convite.status === 'pendente' && (
            <Button variant="outline" onClick={copiarLink}>
              {copiado ? 'Copiado!' : 'Copiar link'}
            </Button>
          )}
          <Button variant="ghost" className="text-red-600 hover:bg-red-50" onClick={() => deletar.mutate(convite.id)}>
            Remover
          </Button>
        </div>
      </div>

      {convite.status === 'preenchido' && !resultado && (
        <div className="mt-3 flex flex-col gap-2 sm:flex-row sm:items-end">
          <div className="flex-1">
            <label className="mb-1 block text-xs font-medium text-muted-foreground">Identificador único (instance)</label>
            <Input value={instance} onChange={(e) => setInstance(e.target.value)} placeholder="renan" />
          </div>
          <Button onClick={finalizarConvite} disabled={finalizar.isPending}>
            {finalizar.isPending ? 'Aprovando...' : 'Aprovar e criar acesso'}
          </Button>
        </div>
      )}
      {erro && <p className="mt-2 text-sm text-red-600">{erro}</p>}
      {resultado && (
        <p className={`mt-2 text-sm ${resultado.praedium === 'criado' ? 'text-emerald-700' : 'text-amber-700'}`}>
          {resultado.praedium === 'criado'
            ? '✅ Corretor aprovado — acesso ao painel e login do Praedium salvos com sucesso.'
            : `⚠️ Acesso ao painel criado, mas o login do Praedium não foi salvo (${resultado.praedium_erro}).`}
        </p>
      )}
    </div>
  );
}

function ConvitesSection() {
  const { data, isLoading } = useConvitesAdmin();
  const criarConvite = useCreateConvite();

  return (
    <div>
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-base font-semibold">Convidar corretor</h2>
          <p className="mt-1 text-sm text-muted-foreground">
            Gera um link pra o próprio corretor preencher os dados dele. Você só define o identificador (instance)
            quando for aprovar.
          </p>
        </div>
        <Button onClick={() => criarConvite.mutate()} disabled={criarConvite.isPending}>
          {criarConvite.isPending ? 'Gerando...' : '+ Gerar link'}
        </Button>
      </div>

      {isLoading ? (
        <p className="mt-2 text-sm text-muted-foreground">Carregando...</p>
      ) : (data?.data ?? []).length > 0 ? (
        <Card className="mt-3">
          {(data?.data ?? []).map((c) => (
            <ConviteRow key={c.id} convite={c} />
          ))}
        </Card>
      ) : (
        <p className="mt-3 text-sm text-muted-foreground">Nenhum convite pendente.</p>
      )}
    </div>
  );
}

function CadastroDiretoSection() {
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
        drive_pasta_teasers: form.drivePastaTeasers.trim() || undefined,
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
    <div>
      <h2 className="text-base font-semibold">Cadastrar diretamente</h2>
      <p className="mt-1 text-sm text-muted-foreground">
        Pra quando você já tem todos os dados do corretor em mãos, sem precisar mandar um link.
      </p>

      <Card className="mt-3 max-w-2xl p-4">
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

          <div className="border-t border-border pt-4">
            <label className="mb-1 block text-xs font-medium text-muted-foreground">ID da pasta de teasers no Google Drive</label>
            <Input
              value={form.drivePastaTeasers}
              onChange={(e) => setForm((f) => ({ ...f, drivePastaTeasers: e.target.value }))}
              className="w-full sm:max-w-xs"
            />
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
    </div>
  );
}

export function AdminCorretoresPage() {
  const { data, isLoading, isError, error } = useCorretoresAdmin();

  return (
    <div className="space-y-8">
      <ConvitesSection />
      <CadastroDiretoSection />

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
