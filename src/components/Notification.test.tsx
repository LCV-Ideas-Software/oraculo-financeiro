// @vitest-environment happy-dom
import { act } from 'react';
import { createRoot } from 'react-dom/client';
import { describe, expect, it } from 'vitest';
import { NotificationProvider, useNotification } from './Notification';

// Thread do PR #1: sem memoização, cada toast (setItems) publicava um objeto
// de contexto NOVO — todos os consumidores re-renderizavam e o value trocava
// de identidade a cada notificação.
Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });

describe('NotificationProvider', () => {
  it('mantém a identidade do value do contexto através de um toast', async () => {
    const seen: Array<ReturnType<typeof useNotification>> = [];
    let fire: ((message: string) => void) | undefined;

    function Probe() {
      const ctx = useNotification();
      seen.push(ctx);
      fire = ctx.showNotification;
      return null;
    }

    const container = document.createElement('div');
    const root = createRoot(container);
    await act(async () => {
      root.render(
        <NotificationProvider>
          <Probe />
        </NotificationProvider>,
      );
    });
    await act(async () => {
      fire?.('primeiro toast');
    });

    expect(seen.length).toBeGreaterThanOrEqual(1);
    expect(new Set(seen).size).toBe(1);

    await act(async () => {
      root.unmount();
    });
  });
});
