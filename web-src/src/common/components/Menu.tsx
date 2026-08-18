import { type ReactNode } from 'react';
import { lazyWithRetry } from '@/common/components/ErrorBoundary';
import { LazyManaged } from '@/common/components/LazyManaged';
import { PopupLoadingStatus } from '@/common/components/ui/status';

export type MenuItem =
  | { separator: true }
  | {
      /** Quiet non-interactive section label ("Favorites", "Recent") —
       *  grouping without a hairline, matching the pill menus' idiom. */
      heading: string;
      separator?: false;
    }
  | {
      separator?: false;
      heading?: undefined;
      label: string;
      /** Optional leading glyph (a 16px icon element). */
      icon?: ReactNode;
      detail?: string;
      shortcut?: string;
      danger?: boolean;
      disabled?: boolean;
      /** Trailing accent check — marks the current choice in picker-style
       *  menus (the app's selection idiom: neutral surface + accent mark). */
      checked?: boolean;
      /** Quiet needs-attention dot after the label (e.g. a library folder
       *  whose preparation failed) — a signal, never a color wash. */
      attention?: boolean;
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
  /** Items pinned above the scrollable body (e.g. the folder switcher's
   *  add-folder actions): when the list below overflows the popup's
   *  height cap, these stay put while `items` scroll. */
  pinnedItems?: MenuItem[];
  onClose: () => void;
  minWidth?: number;
}

const ManagedMenu = lazyWithRetry(() => import('@/common/components/ManagedMenu'));

export function Menu(props: MenuProps) {
  const { anchor } = props;
  const left = 'x' in anchor ? anchor.x : anchor.rect.left;
  const top = 'y' in anchor ? anchor.y : anchor.rect.bottom + 4;
  return (
    <LazyManaged
      as={ManagedMenu}
      fallback={(
        <PopupLoadingStatus
          label="Opening menu…"
          left={left}
          top={top}
          onCancel={props.onClose}
        />
      )}
      componentProps={props}
    />
  );
}
