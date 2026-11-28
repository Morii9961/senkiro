/**
 * Code-based TanStack Router tree (Zero-Codegen: no router plugin, no generated route file).
 *
 *   __root__   validateSearch = parseAppSearchParams  (contract §6, never throws)
 *   ├── /            the full-screen map shell
 *   └── /$module     alias such as /route → redirects to /?module=route
 */
import { APP_MODULES, parseAppSearchParams } from '@senkiro/contracts';
import {
  createRootRoute,
  createRoute,
  createRouter,
  Link,
  Outlet,
  type RouterHistory,
  redirect,
} from '@tanstack/react-router';
import { z } from 'zod';
import { AppShell } from '../shell/AppShell.tsx';
import { DocumentSync } from './DocumentSync.tsx';
import { useMessages } from './hooks.ts';
import { parseSearchString, stringifySearchRecord } from './search.ts';

function RootLayout() {
  return (
    <>
      <DocumentSync />
      <Outlet />
    </>
  );
}

function NotFound() {
  const m = useMessages();
  return (
    <main style={{ padding: '2rem' }}>
      <h1>{m.notFound.title}</h1>
      <Link to="/" search={(prev) => parseAppSearchParams(prev)}>
        {m.notFound.back}
      </Link>
    </main>
  );
}

const rootRoute = createRootRoute({
  validateSearch: (search: Record<string, unknown>) => parseAppSearchParams(search),
  component: RootLayout,
  notFoundComponent: NotFound,
});

const indexRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: '/',
  component: AppShell,
});

const moduleParam = z.enum(APP_MODULES);

const moduleAliasRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: '$module',
  beforeLoad: ({ params, search }) => {
    const parsed = moduleParam.safeParse(params.module.toLowerCase());
    throw redirect({
      to: '/',
      search: parseAppSearchParams({
        ...search,
        module: parsed.success ? parsed.data : search.module,
      }),
      replace: true,
    });
  },
});

const routeTree = rootRoute.addChildren([indexRoute, moduleAliasRoute]);

export interface CreateAppRouterOptions {
  /** Inject a memory history in tests; defaults to browser history. */
  history?: RouterHistory;
}

export function createAppRouter({ history }: CreateAppRouterOptions = {}) {
  return createRouter({
    routeTree,
    ...(history === undefined ? {} : { history }),
    parseSearch: parseSearchString,
    stringifySearch: stringifySearchRecord,
    defaultPreload: false,
    scrollRestoration: false,
  });
}

export type AppRouter = ReturnType<typeof createAppRouter>;

declare module '@tanstack/react-router' {
  interface Register {
    router: AppRouter;
  }
}
