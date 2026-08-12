import { GITHUB_FIELD_MAX_LENGTH } from '../reportBug';
import type { ReportBugControllerState } from './ReportBugDialog';
import { useOverlayLayer } from './OverlayStack';
import { Button } from './ui/button';
import { Checkbox } from './ui/checkbox';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from './ui/dialog';
import { Textarea } from './ui/textarea';

export default function ReportBugSurface({ open, draft, form, status, busy, patchForm, act, close }: ReportBugControllerState) {
  const layer = useOverlayLayer(open);
  return <Dialog open={open} onOpenChange={(nextOpen) => {
    if (!nextOpen && !busy && layer.isTopmost) close();
  }}>
    <DialogContent
      className={`!w-[min(760px,calc(100vw-32px))] !max-w-none max-h-[calc(100vh-32px)] overflow-auto${layer.isTopmost ? ' !z-[10001]' : ''}`}
      overlayClassName={layer.isTopmost ? 'top !z-[10000]' : undefined}
    >
      <DialogHeader>
        <DialogTitle>Report a bug</DialogTitle>
        <DialogDescription>Review everything before sharing. StashBase uploads nothing automatically; continuing sends the prefilled fields to GitHub in your browser, where you choose whether to submit.</DialogDescription>
      </DialogHeader>
      {!draft ? <p>{status}</p> : <div className="grid gap-4">
        <label className="grid gap-1 text-sm font-medium">What happened?<Textarea disabled={busy} maxLength={GITHUB_FIELD_MAX_LENGTH} className="min-h-16 font-normal" value={form.happened} onChange={(e) => patchForm({ happened: e.target.value })} /></label>
        <label className="grid gap-1 text-sm font-medium">What did you expect?<Textarea disabled={busy} maxLength={GITHUB_FIELD_MAX_LENGTH} className="min-h-16 font-normal" value={form.expected} onChange={(e) => patchForm({ expected: e.target.value })} /></label>
        <label className="grid gap-1 text-sm font-medium">Steps to reproduce<Textarea disabled={busy} maxLength={GITHUB_FIELD_MAX_LENGTH} className="min-h-20 font-normal" value={form.steps} onChange={(e) => patchForm({ steps: e.target.value })} /></label>
        <section className="grid gap-2 rounded-lg border border-border p-3">
          <label className="flex items-center gap-2 font-medium"><Checkbox disabled={busy} checked={form.includeScreenshot} onCheckedChange={(checked) => patchForm({ includeScreenshot: checked })} /> Include current-window screenshot</label>
          {form.includeScreenshot && <img className="max-h-56 w-full rounded border border-border object-contain bg-pane" src={draft.screenshotDataUrl} alt="Current StashBase window captured for the report" />}
        </section>
        <section className="grid gap-2 rounded-lg border border-border p-3">
          <label className="flex items-center gap-2 font-medium"><Checkbox disabled={busy} checked={form.includeLogs} onCheckedChange={(checked) => patchForm({ includeLogs: checked })} /> Include recent application log</label>
          {form.includeLogs && <pre className="max-h-44 overflow-auto whitespace-pre-wrap rounded bg-pane p-2 text-xs">{draft.logExcerpt || '(No log was available.)'}</pre>}
        </section>
        {draft.errorDetails && <section className="grid gap-2 rounded-lg border border-border p-3">
          <label className="flex items-center gap-2 font-medium"><Checkbox disabled={busy} checked={form.includeErrorDetails} onCheckedChange={(checked) => patchForm({ includeErrorDetails: checked })} /> Include renderer error details</label>
          {form.includeErrorDetails && <pre className="max-h-44 overflow-auto whitespace-pre-wrap rounded bg-pane p-2 text-xs">{draft.errorDetails}</pre>}
        </section>}
        <section className="rounded-lg border border-border p-3 text-xs">
          <div className="font-medium">Diagnostics</div>
          <div>StashBase {draft.diagnostics.version} · {draft.diagnostics.platform} {draft.diagnostics.release} · {draft.diagnostics.arch} · {draft.diagnostics.packaged ? 'packaged' : 'development'} · {draft.diagnostics.timestamp}</div>
        </section>
        {status && <p className="m-0 text-sm">{status}</p>}
      </div>}
      <DialogFooter>
        <Button variant="outline" disabled={!draft || busy} onClick={() => void act('copy')}>Copy details</Button>
        <Button variant="outline" disabled={!draft || busy} onClick={() => void act('save')}>Save report</Button>
        <Button disabled={!draft || busy} onClick={() => void act('submit')}>Continue to GitHub</Button>
      </DialogFooter>
    </DialogContent>
  </Dialog>;
}
