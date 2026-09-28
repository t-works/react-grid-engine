import type { ReactNode } from 'react';
import type { SplitNode } from '../layout/types';
import { grow } from './styles';

/** Internal node — lays its children out along `axis`. The gap between them is
 * the {@link Splitter} handle, so no flex `gap` here. */
export function Split({
  axis,
  weight,
  children,
}: {
  axis: SplitNode['axis'];
  weight: number | undefined;
  children: ReactNode;
}) {
  return (
    <div
      style={{
        ...grow(weight),
        display: 'flex',
        flexDirection: axis === 'row' ? 'row' : 'column',
        overflow: 'hidden',
      }}
    >
      {children}
    </div>
  );
}
