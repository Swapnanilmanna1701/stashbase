import { FileTypeIcon } from '@/common/components/FileTypeIcon';
import { fileGlyphFormat } from '@/common/lib/fileGlyphFormat';
import { basename } from '@/common/lib/paths';
import { cn } from '@/common/lib/utils';
import { plainSnippetText, searchSnippetText } from '@/features/search/lib/searchSnippet';
import type { LibrarySemanticHit } from '@/features/search/lib/librarySearch';
import type { RowProps } from '@/features/search/lib/searchResultGrouping';

export function SemanticHitRow({ hit, isActive, rowProps }: {
  hit: LibrarySemanticHit;
  isActive: boolean;
  rowProps: RowProps;
}) {
  const fileBasename = basename(hit.rel);
  // No term highlighting on semantic snippets: a semantic hit isn't a literal
  // substring match, so marking the query words would mislead. Frontmatter
  // and Markdown syntax are stripped for DISPLAY only — `hit.content` stays
  // raw because it anchors click-through navigation.
  const snippetSource = plainSnippetText(searchSnippetText(hit.content));
  const snippet = snippetSource.length > 200 ? snippetSource.slice(0, 200) + '…' : snippetSource;
  // The heading arrives as the source line, so a `**Step 4**` heading kept
  // its asterisks — it needs the same flattening as the snippet.
  const heading = hit.heading ? plainSnippetText(hit.heading) : '';
  return (
    /* Identity first, evidence second. A row led by its snippet made every
     * result a wall of same-weight prose with the file name buried at the
     * bottom; leading with the file (strong) over a muted two-line snippet
     * gives the list one scannable left column. Selection is the sidebar's
     * quiet tinted pill — no border, which read as a stack of boxes. */
    <div
      className={cn('cursor-pointer rounded-md px-2.5 py-1.5 hover:bg-muted', isActive && 'bg-active')}
      title={hit.fileName}
      {...rowProps}
    >
      {/* Identity line: the file, then where inside it the hit sits —
        * pushed to the right edge, because "Page 53" / a section title is
        * a locator, not part of the name. Trailing it keeps the file
        * names flush left as one scannable column. The FOLDER is not
        * repeated here: it heads the group this row sits in. */}
      <div className="flex items-baseline gap-2">
        <span className="inline-flex size-4 flex-none translate-y-0.5 items-center justify-center [&_svg]:size-3.5">
          <FileTypeIcon format={fileGlyphFormat(fileBasename).format} />
        </span>
        <span className="min-w-0 truncate text-base font-medium text-foreground">{fileBasename}</span>
        {heading && (
          <span className="ml-auto max-w-[45%] flex-none truncate text-xs text-muted-foreground">{heading}</span>
        )}
      </div>
      {/* No match-strength bar: hybrid scores carry no absolute meaning,
        * so a per-hit gauge invited comparisons it could not support.
        * Rank order alone communicates relative strength. */}
      <div className="mt-0.5 line-clamp-2 pl-5.5 text-sm text-muted-foreground">{snippet}</div>
    </div>
  );
}
