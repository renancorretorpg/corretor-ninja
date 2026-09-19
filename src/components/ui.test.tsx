import { describe, it, expect } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';
import { Modal } from './ui';

// So a marcacao estatica (roda em Node, sem navegador). O comportamento de
// teclado/foco (Esc, Tab preso, devolver o foco) vive em efeitos e precisa de
// um DOM de verdade pra ser testado.
describe('Modal (acessibilidade)', () => {
  it('nao renderiza nada quando fechado', () => {
    const html = renderToStaticMarkup(
      <Modal open={false} onClose={() => {}} title="Titulo">conteudo</Modal>,
    );
    expect(html).toBe('');
  });

  it('expoe role=dialog, aria-modal e o titulo como nome acessivel', () => {
    const html = renderToStaticMarkup(
      <Modal open onClose={() => {}} title="Excluir lead?">conteudo</Modal>,
    );
    expect(html).toContain('role="dialog"');
    expect(html).toContain('aria-modal="true"');
    const labelledby = html.match(/aria-labelledby="([^"]+)"/)?.[1];
    expect(labelledby).toBeTruthy();
    expect(html).toContain(`id="${labelledby}"`);
    expect(html).toContain('Excluir lead?');
  });

  it('e focavel por script (tabindex=-1) pra receber o foco ao abrir', () => {
    const html = renderToStaticMarkup(
      <Modal open onClose={() => {}} title="T">x</Modal>,
    );
    expect(html).toContain('tabindex="-1"');
  });

  it('da ids de titulo diferentes pra cada modal aberto', () => {
    const html = renderToStaticMarkup(
      <>
        <Modal open onClose={() => {}} title="A">a</Modal>
        <Modal open onClose={() => {}} title="B">b</Modal>
      </>,
    );
    const ids = [...html.matchAll(/aria-labelledby="([^"]+)"/g)].map((m) => m[1]);
    expect(ids).toHaveLength(2);
    expect(new Set(ids).size).toBe(2);
  });
});
