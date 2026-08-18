import { CheckIcon, ChevronDownIcon, FolderIcon, LibraryIcon } from '@/common/components/icons';
import { cn } from '@/common/lib/utils';
import {
  Menu,
  MenuItem,
  MenuPopup,
  MenuPortal,
  MenuPositioner,
  MenuTrigger,
} from '@/common/components/ui/menu';
import { basename, shortenFolderPath } from '@/common/lib/paths';
import {
  folderScope,
  LIBRARY_SCOPE,
  scopeDisplayName,
  type LibraryFolderOption,
  type LibraryScope,
} from '@/common/lib/libraryScope';
import {
  menuHeadClass, menuSectionClass, optActiveClass, optCheckClass, optClass, optDescClass,
  optIconClass, optTextClass, optTitleClass, pillChevronClass, pillClass, pillLockedClass,
} from '@/common/lib/pillMenuStyles';

/**
 * The app's ONE scope picker: the whole Library, or one library folder.
 * Both surfaces that pick a scope share it — the chat composer (which
 * scope a new session binds) and the search popup (which folder a search
 * covers) — so the two read as the same control with the same rows,
 * ordering, and states rather than two lookalikes that drift.
 *
 * Callers vary only the copy (`heading`, `libraryDetail`), the side the
 * popup opens toward, and whether the trigger is locked (the composer
 * locks it once a conversation has content — a chat never rebinds).
 */
export function ScopeMenu({
  scope,
  entries,
  homeDir,
  heading,
  libraryDetail,
  side = 'top',
  ariaLabel,
  locked = false,
  disabled = false,
  triggerClassName,
  onSetScope,
}: {
  scope: LibraryScope;
  entries: LibraryFolderOption[];
  homeDir: string;
  /** Menu title, e.g. "Session scope" / "Search scope". */
  heading: string;
  /** Second line on the Library row, e.g. "Search every folder". */
  libraryDetail: string;
  side?: 'top' | 'bottom';
  ariaLabel?: string;
  locked?: boolean;
  disabled?: boolean;
  triggerClassName?: string;
  onSetScope: (scope: LibraryScope) => void;
}) {
  const isLibrary = scope.kind === 'library';
  return (
    <Menu>
      <MenuTrigger
        className={cn(pillClass, 'max-w-40', locked && pillLockedClass, triggerClassName)}
        disabled={disabled || locked}
        aria-label={ariaLabel ?? heading}
        title={isLibrary
          ? `${heading} — the whole library`
          : `${heading} — ${shortenFolderPath(scope.path, homeDir)}`}
      >
        {/* No leading glyph on the trigger: the scope NAME is the content
          * (often carrying the user's own emoji), and a folder icon next
          * to it reads as a double mark. The menu's rows keep icons. */}
        <span className="truncate">{scopeDisplayName(scope)}</span>
        <ChevronDownIcon className={pillChevronClass} />
      </MenuTrigger>
      <MenuPortal>
        <MenuPositioner side={side} align="start" sideOffset={6} collisionPadding={8}>
          <MenuPopup className="max-h-[min(360px,55vh)] w-85 max-w-[calc(100vw-24px)] overflow-auto p-1.5" aria-label={heading}>
            <div className={menuHeadClass}><span className="font-semibold text-foreground">{heading}</span></div>
            <MenuItem label="Library" className={cn(optClass, isLibrary && optActiveClass)} onClick={() => onSetScope(LIBRARY_SCOPE)}>
              <LibraryIcon className={optIconClass} />
              <span className={optTextClass}><span className={optTitleClass}>Library</span><span className={optDescClass}>{libraryDetail}</span></span>
              {isLibrary && <CheckIcon className={optCheckClass} />}
            </MenuItem>
            {entries.length > 0 && <div className={menuSectionClass}>Folders</div>}
            {entries.map((entry) => {
              const active = scope.kind === 'folder' && scope.path === entry.path;
              return (
                <MenuItem key={entry.path} label={basename(entry.path)} className={cn(optClass, active && optActiveClass)} onClick={() => onSetScope(folderScope(entry.path))}>
                  <FolderIcon className={optIconClass} />
                  <span className={optTextClass}><span className={optTitleClass}>{basename(entry.path)}</span><span className={optDescClass}>{shortenFolderPath(entry.path, homeDir)}</span></span>
                  {active && <CheckIcon className={optCheckClass} />}
                </MenuItem>
              );
            })}
          </MenuPopup>
        </MenuPositioner>
      </MenuPortal>
    </Menu>
  );
}
