/**
 * Placeholder for a `component` key absent from the registry (FR-16). The tab
 * node stays in the layout, so it survives a save/load round-trip.
 */
export function MissingComponent({ component }: { component: string }) {
  return (
    <div
      role="note"
      data-twge-missing={component}
      style={{ padding: 8, font: '13px system-ui, sans-serif', color: '#b91c1c' }}
    >
      Missing component “{component}”
    </div>
  );
}
