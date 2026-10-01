import { useState } from 'react';
import { GridEngine, parseLayout, serializeLayout } from '@t-works/react-grid-engine';
import type { Layout } from '@t-works/react-grid-engine';
import layoutJson from './layout.json';
import { flatLayout, perfLayout } from './fixtures';
import { expandRegistry, guardRegistry, registry } from './registry';

/**
 * `standalone-basic` — static JSON layout, tabs, add/close and tab color (task
 * 11). Data first: `layout.json` is the real wire format, replayed verbatim.
 *
 * `?flat` (task 12 §9.1) and `?perf` (task 13) swap the fixture. The layout is
 * persisted as the real wire format, so a reload is a genuine `parseLayout`
 * round-trip; `data-twge-layout` exposes the current JSON to Playwright.
 */
const defaultLayout = layoutJson as Layout;

export default function App() {
  const params = new URLSearchParams(window.location.search);
  const guards = params.has('guards');
  const expand = params.has('expand');
  const mode = params.has('perf')
    ? 'perf'
    : params.has('flat')
      ? 'flat'
      : guards
        ? 'guards'
        : expand
          ? 'expand'
          : '';
  const fallback = mode === 'perf' ? perfLayout : mode === 'flat' ? () => flatLayout : () => defaultLayout;
  const storageKey = `react-grid-engine:standalone-basic${mode ? `:${mode}` : ''}`;

  const [initial] = useState<Layout>(() => {
    const base = fallback();
    const raw = localStorage.getItem(storageKey);
    return raw === null ? base : parseLayout(raw, base);
  });
  const [json, setJson] = useState(() => serializeLayout(initial));

  return (
    <div style={{ height: '100vh' }} data-twge-layout={json}>
      <GridEngine
        defaultLayout={initial}
        registry={guards ? guardRegistry : expand ? expandRegistry : registry}
        onLayoutChange={(layout) => {
          const next = serializeLayout(layout);
          localStorage.setItem(storageKey, next);
          setJson(next);
        }}
      />
    </div>
  );
}
