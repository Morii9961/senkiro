import { createMemoryHistory, RouterProvider } from '@tanstack/react-router';
import { type RenderResult, render, screen } from '@testing-library/react';
import { type AppRouter, createAppRouter } from '../src/app/router.tsx';
import { type ShellSlots, ShellSlotsProvider } from '../src/slots/slots.tsx';
import { useShellUi } from '../src/state/ui-store.ts';

export interface RenderAppResult extends RenderResult {
  router: AppRouter;
  /** Current query string as it would appear in the address bar. */
  searchStr: () => string;
  href: () => string;
}

/** Render the full app at `url` with an in-memory history, as a real visit would. */
export async function renderApp(url = '/', slots: ShellSlots = {}): Promise<RenderAppResult> {
  useShellUi.getState().reset();
  const router = createAppRouter({ history: createMemoryHistory({ initialEntries: [url] }) });
  await router.load();
  const utils = render(
    <ShellSlotsProvider slots={slots}>
      <RouterProvider router={router} />
    </ShellSlotsProvider>,
  );
  await screen.findByRole('navigation');
  return {
    ...utils,
    router,
    searchStr: () => router.state.location.searchStr,
    href: () => router.state.location.href,
  };
}
