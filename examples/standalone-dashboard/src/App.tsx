import { useRef, useState } from 'react';
import { GridEngine, parseLayout, serializeLayout } from '@t-works/react-grid-engine';
import type {
  GridEngineHandle,
  Layout,
  TabEventHandler,
} from '@t-works/react-grid-engine';
import layoutJson from './layout.json';
import { registry } from './registry';

/**
 * `standalone-dashboard` — full drag/drop, splitters, several component types,
 * `onLayoutChange` persisted to `localStorage` (task 11). Data first:
 * `layout.json` is the fallback, the saved wire format wins when present.
 */
const storageKey = 'react-grid-engine:standalone-dashboard';

/** `parseLayout` never throws: corruption warns and falls back (§9.1, FR-15). */
export function loadLayout(fallback: Layout): Layout {
  const raw = localStorage.getItem(storageKey);
  return raw === null ? fallback : parseLayout(raw, fallback);
}

export default function App() {
  const engine = useRef<GridEngineHandle>(null);
  const [initial] = useState(() => loadLayout(layoutJson as Layout));
  const [event, setEvent] = useState<{ tabId: string; type: string; payload: unknown } | null>(
    null,
  );

  const onTabEvent: TabEventHandler = (tabId, type, payload) => setEvent({ tabId, type, payload });

  return (
    <div style={{ height: '100vh', display: 'flex', flexDirection: 'column', fontFamily: 'system-ui' }}>
      <header
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: 12,
          padding: '8px 12px',
          borderBottom: '1px solid #d4d4d4',
        }}
      >
        <strong>standalone-dashboard</strong>
        <button type="button" onClick={() => engine.current?.addTab({ component: 'chart' })}>
          Add chart
        </button>
        <button
          type="button"
          data-twge-reset
          onClick={() => {
            localStorage.removeItem(storageKey);
            window.location.reload();
          }}
        >
          Reset layout
        </button>
      </header>

      <div style={{ flex: 1, minHeight: 0, position: 'relative' }}>
        <GridEngine
          ref={engine}
          defaultLayout={initial}
          registry={registry}
          onLayoutChange={(layout) => localStorage.setItem(storageKey, serializeLayout(layout))}
          onTabEvent={onTabEvent}
        />

        {event && (
          <div
            data-twge-event-echo
            data-twge-event-tab={event.tabId}
            role="status"
            style={{
              position: 'fixed',
              right: 16,
              bottom: 16,
              zIndex: 3000,
              padding: '10px 14px',
              borderRadius: 6,
              background: '#111827',
              color: '#f9fafb',
              fontFamily: 'ui-monospace, monospace',
              boxShadow: '0 6px 20px rgba(0, 0, 0, 0.3)',
            }}
          >
            <div>{event.tabId}</div>
            <div data-twge-event-type>{event.type}</div>
            <div data-twge-event-payload>{JSON.stringify(event.payload)}</div>
          </div>
        )}
      </div>
    </div>
  );
}
