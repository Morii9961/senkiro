import { useEffect } from 'react';
import { useAppSearch, useMessages } from './hooks.ts';

/**
 * Mirrors URL language and theme onto <html> so tokens, portals and `:lang()` rules all
 * follow the URL, and keeps the document title in the current language.
 */
export function DocumentSync() {
  const { lang, theme, module } = useAppSearch();
  const m = useMessages();
  useEffect(() => {
    const root = document.documentElement;
    root.lang = lang;
    root.dataset.theme = theme;
    document.title = `${m.modules[module].title} — ${m.brand.tagline}`;
  }, [lang, theme, module, m]);
  return null;
}
