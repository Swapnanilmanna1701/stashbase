import { useMemo, useRef } from 'react';
import type { MenuProps } from './Menu';
import {
  Menu as MenuRoot,
  MenuItem as MenuPrimitiveItem,
  MenuPopup,
  MenuPortal,
  MenuPositioner,
  MenuSeparator,
} from './ui/menu';

export default function ManagedMenu({
  anchor,
  items,
  onClose,
  minWidth,
}: MenuProps) {
  const finalFocusRef = useRef<HTMLElement | null>(
    document.activeElement instanceof HTMLElement ? document.activeElement : null,
  );
  const returnFocusRef = useRef(true);
  const virtualAnchor = useMemo(
    () => ({
      getBoundingClientRect: () => (
        'rect' in anchor
          ? anchor.rect
          : new DOMRect(anchor.x, anchor.y, 0, 0)
      ),
    }),
    [anchor],
  );
  const pointAnchor = 'x' in anchor;
  const align = 'rect' in anchor && anchor.align === 'right' ? 'end' : 'start';

  return (
    <MenuRoot
      open
      onOpenChange={(open) => {
        if (!open) onClose();
      }}
    >
      <MenuPortal>
        <MenuPositioner
          anchor={virtualAnchor}
          positionMethod="fixed"
          side="bottom"
          align={align}
          sideOffset={pointAnchor ? 0 : 4}
          collisionPadding={6}
        >
          <MenuPopup
            finalFocus={() => returnFocusRef.current ? finalFocusRef.current : false}
            style={{ minWidth }}
          >
            {items.map((item, index) => (
              item.separator
                ? <MenuSeparator key={`separator-${index}`} />
                : (
                  <MenuPrimitiveItem
                    key={`${item.label}-${index}`}
                    label={item.label}
                    disabled={item.disabled}
                    title={item.title}
                    className={item.danger
                      ? 'text-danger data-highlighted:bg-[color-mix(in_srgb,var(--danger)_10%,transparent)]'
                      : undefined}
                    onClick={() => {
                      returnFocusRef.current = item.returnFocus !== false;
                      item.onSelect();
                    }}
                  >
                    <span className="flex min-w-0 flex-col gap-0.5">
                      <span className="flex items-center gap-2 whitespace-nowrap">
                        {item.icon && (
                          <span className="shrink-0 [&_svg]:block [&_svg]:size-4" aria-hidden="true">
                            {item.icon}
                          </span>
                        )}
                        <span>{item.label}</span>
                      </span>
                      {item.detail && (
                        <span className={`text-xs text-muted-foreground ${item.icon ? 'pl-6' : ''}`}>
                          {item.detail}
                        </span>
                      )}
                    </span>
                    {item.shortcut && (
                      <span className="shrink-0 text-xs tracking-[0.04em] text-muted-foreground">
                        {item.shortcut}
                      </span>
                    )}
                  </MenuPrimitiveItem>
                )
            ))}
          </MenuPopup>
        </MenuPositioner>
      </MenuPortal>
    </MenuRoot>
  );
}
