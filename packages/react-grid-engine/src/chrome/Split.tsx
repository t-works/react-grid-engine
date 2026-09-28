import type { ReactNode } from 'react';
import type { SplitNode } from '../layout/types';
import { chrome, grow } from './styles';

/** Internal node — lays its children out along `axis`. Splitters arrive in 05. */
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
        gap: chrome('gap', '4px'),
        overflow: 'hidden',
      }}
    >
      {children}
    </div>
  );
}
