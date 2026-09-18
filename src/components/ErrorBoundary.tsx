import { Component, type ErrorInfo, type ReactNode } from 'react';

interface State {
  erro: Error | null;
}

export class ErrorBoundary extends Component<{ children: ReactNode }, State> {
  state: State = { erro: null };

  static getDerivedStateFromError(erro: Error): State {
    return { erro };
  }

  componentDidCatch(erro: Error, info: ErrorInfo) {
    console.error('Erro não tratado na interface:', erro, info.componentStack);
  }

  render() {
    if (!this.state.erro) return this.props.children;
    return (
      <div role="alert" className="mx-auto mt-16 max-w-md rounded-lg border border-border bg-card p-6 text-center shadow-sm">
        <h1 className="text-base font-semibold">Algo deu errado</h1>
        <p className="mt-2 text-sm text-muted-foreground">
          Ocorreu um erro inesperado nesta tela. Seus dados não foram perdidos. Recarregue a página para continuar.
        </p>
        <button
          type="button"
          onClick={() => window.location.reload()}
          className="mt-4 inline-flex min-h-[44px] items-center justify-center rounded-md bg-primary px-4 text-sm font-medium text-primary-foreground hover:opacity-90"
        >
          Recarregar página
        </button>
      </div>
    );
  }
}
