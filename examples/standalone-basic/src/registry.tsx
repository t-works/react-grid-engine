import type { CSSProperties } from 'react';
import { useState } from 'react';
import type { PanelComponentProps, PanelRegistry } from '@t-works/react-grid-engine';

const box: CSSProperties = { padding: 12, font: '13px system-ui, sans-serif' };

function Welcome({ config }: PanelComponentProps<{ name?: string }>) {
  return (
    <div style={box}>
      Welcome{config.name ? `, ${config.name}` : ''} — this layout is static JSON, with colors on
      the wire.
    </div>
  );
}

function Notes({ config }: PanelComponentProps) {
  return <div style={box}>Notes — config: {JSON.stringify(config)}</div>;
}

/** The example's registry: a string-keyed catalogue, never serialized. */
export const registry: PanelRegistry = {
  welcome: {
    component: Welcome,
    defaultColor: '#0ea5e9',
    createConfig: () => ({ name: 'Ada' }),
  },
  // No `defaultConfig`/`createConfig` — new tabs fall back to `{}` (A11).
  notes: { component: Notes, defaultColor: '#22c55e' },
};

/**
 * Task-07 browser fixtures, behind `?guards` so the default example keeps its
 * two-component registry (see `e2e/tab-menu.spec.ts`).
 */
export const guardRegistry: PanelRegistry = {
  ...registry,
  guarded: {
    component: () => <div style={box}>Guarded — close is blocked.</div>,
    title: () => 'Guarded',
    canClose: () => false,
  },
  unsaved: {
    component: () => <div style={box}>Unsaved — close rejects.</div>,
    title: () => 'Unsaved',
    canClose: () => Promise.reject(new Error('unsaved changes')),
  },
  single: {
    component: () => <div style={box}>Single — allowMultiple: false.</div>,
    title: () => 'Single',
    allowMultiple: false,
  },
  locked: {
    component: () => <div style={box}>Locked — not closeable, title fixed.</div>,
    title: () => 'Locked',
    closeable: false,
    titleEditable: false,
  },
};

/**
 * Expand fixture, behind `?expand`: a stateful panel, so `e2e/expand.spec.ts`
 * can prove the overlay does not remount the tab component.
 */
function Counter() {
  const [n, setN] = useState(0);
  return (
    <div style={box}>
      <button data-twge-counter type="button" onClick={() => setN((v) => v + 1)}>
        count: {n}
      </button>
    </div>
  );
}

export const expandRegistry: PanelRegistry = {
  ...registry,
  counter: { component: Counter, title: () => 'Counter' },
};
