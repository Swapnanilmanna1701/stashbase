import { Suspense, type ReactNode } from 'react';
import { lazyWithRetry } from './ErrorBoundary';
import { PopupLoadingStatus } from './ui/status';

export type MenuItem =
  | { separator: true }
  | {
      separator?: false;
      label: string;
      /** Optional leading glyph (a 16px icon element). */
      icon?: ReactNode;
      detail?: string;
      shortcut?: string;
      danger?: boolean;
      disabled?: boolean;
      title?: string;
      /** Keep focus at the destination mounted by this action instead of
       * returning it to the menu invoker. */
      returnFocus?: boolean;
      onSelect: () => void;
    };

export type MenuAnchor =
  | { x: number; y: number }
  | { rect: DOMRect; align?: 'left' | 'right' };

export interface MenuProps {
  anchor: MenuAnchor;
  items: MenuItem[];
  onClose: () => void;
  minWidth?: number;
}

const ManagedMenu = lazyWithRetry(() => import('./ManagedMenu'));

export function Menu(props: MenuProps) {
  const { anchor } = props;
  const left = 'x' in anchor ? anchor.x : anchor.rect.left;
  const top = 'y' in anchor ? anchor.y : anchor.rect.bottom + 4;
  return (
    <Suspense
      fallback={(
        <PopupLoadingStatus
          label="Opening menu…"
          left={left}
          top={top}
          onCancel={props.onClose}
        />
      )}
    >
      <ManagedMenu {...props} />
    </Suspense>
  );
}
