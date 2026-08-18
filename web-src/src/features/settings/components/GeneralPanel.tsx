import { electronBridge, type DesktopUpdateSimulation } from '@/common/lib/electronBridge';
import { useGeneralSettings } from '@/features/settings/hooks/useGeneralSettings';
import { Button } from '@/common/components/ui/button';
import { Checkbox } from '@/common/components/ui/checkbox';
import { Select } from '@/common/components/ui/select';

export function GeneralPanel() {
  const {
    capture: preferences,
    captureError: error,
    savingCapture: saving,
    setClipboardImageImport,
    updates: updatePreferences,
    updateError,
    savingUpdates,
    setAutomaticUpdateChecks,
    updateState,
    checkNow,
    runPrimaryAction,
    openDownloadPage,
    setSimulation,
  } = useGeneralSettings();

  function updateStatus() {
    if (!updateState) return 'Update status is available in the desktop app.';
    switch (updateState.phase) {
      case 'checking': return 'Checking for updates…';
      case 'current': return `StashBase ${updateState.currentVersion} is up to date.`;
      case 'available': return `StashBase ${updateState.availableVersion} is available.`;
      case 'downloading': return `Downloading StashBase ${updateState.availableVersion}${updateState.percent === undefined ? '…' : ` — ${updateState.percent}%`}`;
      case 'ready': return `StashBase ${updateState.availableVersion} is ready to install.`;
      case 'installing': return `Installing StashBase ${updateState.availableVersion} and restarting…`;
      case 'error': return updateState.message || 'The update check failed.';
      case 'unsupported': return updateState.message || 'Update checks are unavailable in this build.';
      default: return `Current version: ${updateState.currentVersion}`;
    }
  }

  if (!preferences) {
    return error
      ? <div className="text-sm text-destructive">Couldn’t load capture settings: {error}</div>
      : <div className="py-3 text-base text-muted-foreground">Loading…</div>;
  }

  return (
    <div>
      <div className="mb-1 text-base font-semibold">Knowledge capture</div>
      <div className="text-sm leading-normal text-muted-foreground">
        Choose which ambient sources StashBase may notice. Nothing is added to a folder without confirmation.
      </div>
      <div className="mt-5.5 flex items-start gap-2 text-sm text-foreground">
        <Checkbox
          id="clipboard-image-import"
          className="mt-0.5"
          checked={preferences.clipboardImageImport}
          disabled={saving}
          onCheckedChange={(checked) => { void setClipboardImageImport(checked); }}
        />
        <label htmlFor="clipboard-image-import" className="cursor-pointer">
          <span className="block font-semibold">Offer to add clipboard screenshots</span>
          <span className="mt-0.5 block leading-normal text-muted-foreground">
            While a StashBase window is focused, notice copied images and ask before adding one to the current folder for OCR and search.
          </span>
        </label>
      </div>
      {error && <div className="mt-2.5 text-sm text-destructive">Couldn’t save capture settings: {error}</div>}

      <div className="mt-7 border-t border-border pt-6">
        <div className="mb-1 text-base font-semibold">Application updates</div>
        <div className="text-sm leading-normal text-muted-foreground">
          StashBase verifies updates published through the official GitHub release channel. Clicking Update downloads, installs, and restarts the app after open edits are saved.
        </div>
        {updatePreferences ? (
          <div className="mt-5.5 flex items-start gap-2 text-sm text-foreground">
            <Checkbox
              id="automatic-update-checks"
              className="mt-0.5"
              checked={updatePreferences.autoCheck}
              disabled={savingUpdates}
              onCheckedChange={(checked) => { void setAutomaticUpdateChecks(checked); }}
            />
            <label htmlFor="automatic-update-checks" className="cursor-pointer">
              <span className="block font-semibold">Automatically check for updates</span>
              <span className="mt-0.5 block leading-normal text-muted-foreground">
                Check shortly after launch and periodically while StashBase is running. This is enabled by default.
              </span>
            </label>
          </div>
        ) : (
          <div className="mt-5 text-sm text-muted-foreground">Loading update preferences…</div>
        )}
        <div className="mt-4 flex flex-wrap items-center gap-2">
          <Button
            variant="outline"
            size="sm"
            disabled={!electronBridge()?.checkForUpdates || updateState?.phase === 'checking' || updateState?.phase === 'downloading' || updateState?.phase === 'installing'}
            onClick={() => { void checkNow(); }}
          >
            {updateState?.phase === 'checking' ? 'Checking…' : 'Check for updates'}
          </Button>
          {updateState?.availableVersion && (
            <Button
              size="sm"
              disabled={updateState.phase === 'downloading' || updateState.phase === 'installing'}
              onClick={() => { void runPrimaryAction(); }}
            >
              {updateState.phase === 'ready'
                ? 'Install update'
                : updateState.phase === 'downloading'
                  ? `Downloading ${updateState.percent ?? 0}%`
                  : updateState.phase === 'installing'
                    ? 'Installing…'
                    : 'Update and restart'}
            </Button>
          )}
          {(updateState?.phase === 'error' || updateState?.phase === 'unsupported') && (
            <Button variant="ghost" size="sm" onClick={() => { void openDownloadPage(); }}>
              Open download page
            </Button>
          )}
        </div>
        <div className={`mt-2.5 text-sm ${updateState?.phase === 'error' || updateError ? 'text-destructive' : 'text-muted-foreground'}`}>
          {updateError || updateStatus()}
        </div>
        {updateState?.platform === 'linux' && (
          <div className="mt-1 text-xs leading-normal text-muted-foreground">
            Linux package installs may ask for administrator approval before StashBase can restart.
          </div>
        )}
        {updateState?.simulation?.enabled && (
          <section className="mt-5 rounded-lg border border-status-warning/30 bg-status-warning/10 p-3">
            <div className="mb-1 flex flex-wrap items-center gap-2">
              <div className="text-base font-semibold">Desktop update testing</div>
              <span className="rounded-xs border border-status-warning/30 bg-background px-1.5 py-0.5 text-2xs font-semibold tracking-wide text-status-warning uppercase">
                Development only
              </span>
            </div>
            <p className="mt-0 mb-3 text-sm leading-normal text-muted-foreground">
              Preview update states in Settings and the sidebar without contacting the release channel, downloading, or installing anything.
            </p>
            <label className="flex items-center justify-between gap-3 text-sm text-foreground">
              <span>Simulated update state</span>
              <Select
                className="min-w-48"
                value={updateState.simulation.value}
                onChange={(event) => { void setSimulation(event.target.value as DesktopUpdateSimulation); }}
              >
                <option value="off">Off — real updater</option>
                <option value="available">Update available</option>
                <option value="downloading">Downloading — 42%</option>
                <option value="ready">Ready to install</option>
                <option value="installing">Installing</option>
                <option value="error">Update error</option>
              </Select>
            </label>
          </section>
        )}
      </div>
    </div>
  );
}
