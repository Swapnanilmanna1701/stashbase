import { useMemo, useRef } from 'react';
import { CheckIcon } from '@/common/components/icons';
import type { MenuProps } from '@/common/components/Menu';
import {
  Menu as MenuRoot,
  MenuItem as MenuPrimitiveItem,
  MenuPopup,
  MenuPortal,
  MenuPositioner,
  MenuSeparator,
} from '@/common/components/ui/menu';

export default function ManagedMenu({
  anchor,
  items,
  pinnedItems,
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
            /* Cap the popup both ways: a long untruncatable detail (an
             * absolute path outside the home dir) truncates against the
             * width bound, and a long list (the folder switcher on a big
             * library) scrolls INSIDE the card instead of running the
             * viewport. Only the body scrolls: `pinnedItems` (the
             * switcher's add-folder actions, ending in the one hairline)
             * stay put above it, so the escape-hatch actions never
             * scroll away and the hairline reads as the scroll edge. */
            className="flex max-h-[min(440px,70vh)] max-w-[min(400px,calc(100vw-24px))] flex-col"
            style={{ minWidth }}
          >
            {pinnedItems && pinnedItems.length > 0 && (
              <div className="flex-none">{renderMenuItems(pinnedItems, returnFocusRef)}</div>
            )}
            <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain scrollbar-quiet">
              {renderMenuItems(items, returnFocusRef)}
            </div>
          </MenuPopup>
        </MenuPositioner>
      </MenuPortal>
    </MenuRoot>
  );
}

function renderMenuItems(
  items: MenuProps['items'],
  returnFocusRef: { current: boolean },
) {
  return items.map((item, index) => (
              item.separator
                ? <MenuSeparator key={`separator-${index}`} />
                : 'heading' in item && item.heading !== undefined
                ? (
                  /* Same quiet section-label recipe as the composer pill
                   * menus (pillMenuStyles.menuSectionClass). */
                  <div key={`heading-${index}`} className="px-2 pt-2 pb-1 text-xs font-medium text-muted-foreground" role="presentation">
                    {item.heading}
                  </div>
                )
                : (
                  <MenuPrimitiveItem
                    key={`${item.label}-${index}`}
                    label={item.label}
                    disabled={item.disabled}
                    title={item.title}
                    className={item.danger
                      ? 'text-danger data-highlighted:bg-destructive/10'
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
                        <span className="min-w-0 truncate">{item.label}</span>
                        {item.attention && (
                          <span
                            className="size-1.5 shrink-0 rounded-full bg-status-danger/80"
                            title="Needs attention"
                            aria-label="Needs attention"
                          />
                        )}
                      </span>
                      {item.detail && (
                        <span className={`truncate text-xs text-muted-foreground ${item.icon ? 'pl-6' : ''}`}>
                          {item.detail}
                        </span>
                      )}
                    </span>
                    {item.shortcut && (
                      <span className="shrink-0 text-xs tracking-[0.04em] text-muted-foreground">
                        {item.shortcut}
                      </span>
                    )}
                    {item.checked && (
                      <CheckIcon className="ml-auto size-4 shrink-0 text-accent" aria-hidden="true" />
                    )}
                  </MenuPrimitiveItem>
                )
  ));
}
