import '@/features/settings/settings.css';
import { type TranscriptionModelId } from '@/common/api/apiTypes';
import { formatMiB } from '@/common/lib/format';
import { useTranscriptionSettings } from '@/features/settings/hooks/useTranscriptionSettings';
import { TRANSCRIPTION_LANGUAGE_OPTIONS } from '@shared/transcription';
import { Button } from '@/common/components/ui/button';
import { Select } from '@/common/components/ui/select';

export function TranscriptionPanel() {
  const {
    settings,
    error,
    busyModel,
    retry,
    chooseModel,
    chooseLanguage,
    download,
    remove,
  } = useTranscriptionSettings();

  if (!settings && !error) return <div className="py-3 text-base text-muted-foreground">Loading…</div>;
  if (!settings) {
    return (
      <div className="flex flex-col items-start gap-2.5">
        <div className="text-sm text-destructive">Couldn’t load transcription settings: {error}</div>
        <Button variant="outline" size="sm" onClick={retry}>Retry</Button>
      </div>
    );
  }

  const selectedProvider = settings.providers.find((provider) => provider.id === settings.providerId)
    ?? settings.providers[0];

  return (
    <div className="flex flex-col gap-2.5">
      <div>
        <div className="mb-1 text-base font-semibold">Transcription provider and model</div>
        <div className="mb-2.5 text-sm leading-normal text-muted-foreground">
          {selectedProvider?.description ?? 'Choose the provider and model used for audio transcription.'}
        </div>
        {settings.providers.length > 1 && (
          <Select
            className="min-w-45 self-start"
            value={selectedProvider?.id ?? ''}
            onChange={(event) => {
              const provider = settings.providers.find((candidate) => candidate.id === event.target.value);
              const model = provider?.models[0];
              if (provider && model) void chooseModel(provider.id, model.id);
            }}
          >
            {settings.providers.map((provider) => <option key={provider.id} value={provider.id}>{provider.label}</option>)}
          </Select>
        )}
        {selectedProvider?.runtimeError && (
          <div className="text-sm text-destructive">Transcription runtime unavailable: {selectedProvider.runtimeError}</div>
        )}
        <div className="transcription-model-list">
          {(selectedProvider?.models ?? []).map((model) => {
            const operation = model.operation ?? { status: 'idle' as const };
            const downloading = operation.status === 'downloading';
            const verifying = operation.status === 'verifying';
            const progress = operation.status === 'downloading' && operation.totalBytes > 0
              ? Math.min(100, (operation.receivedBytes / operation.totalBytes) * 100)
              : 0;
            return (
              <div key={model.id} className={'transcription-model-row' + (settings.providerId === selectedProvider?.id && settings.modelId === model.id ? ' selected' : '')}>
                <label>
                  <input
                    type="radio"
                    name="transcription-model"
                    checked={settings.providerId === selectedProvider?.id && settings.modelId === model.id}
                    onChange={() => { if (selectedProvider) void chooseModel(selectedProvider.id, model.id); }}
                  />
                  <span>
                    <strong>{model.label}</strong>
                    {(model.sizeBytes || model.speed || model.accuracy) && (
                      <small>{[model.sizeBytes ? formatMiB(model.sizeBytes) : '', model.speed, model.accuracy].filter(Boolean).join(' · ')}</small>
                    )}
                    {model.resourceUse && <small>{model.resourceUse} · multilingual</small>}
                  </span>
                </label>
                <div className="transcription-model-action">
                  {model.management === 'provider' ? (
                    <span className="text-sm text-muted-foreground">{model.available ? 'Available' : 'Unavailable'}</span>
                  ) : downloading ? (
                    <>
                      <span className="transcription-download-progress" title={`${progress.toFixed(0)}%`}>
                        <span style={{ width: `${progress}%` }} />
                      </span>
                      <Button variant="outline" size="sm" disabled={busyModel === model.id} onClick={() => { void remove(model.id as TranscriptionModelId, false); }}>
                        Cancel
                      </Button>
                    </>
                  ) : verifying ? (
                    <span className="text-sm text-muted-foreground">Verifying…</span>
                  ) : model.available ? (
                    <Button variant="outline" size="sm" disabled={busyModel === model.id} onClick={() => { void remove(model.id as TranscriptionModelId); }}>
                      Remove
                    </Button>
                  ) : (
                    <Button
                      size="sm"
                      disabled={busyModel === model.id || !!selectedProvider?.runtimeError}
                      title={selectedProvider?.runtimeError ? 'Install or repair the local transcription runtime first.' : undefined}
                      onClick={() => { void download(model.id as TranscriptionModelId); }}
                    >
                      {operation.status === 'failed' ? 'Retry download' : 'Download'}
                    </Button>
                  )}
                </div>
                {operation.status === 'failed' && <div className="transcription-model-error text-sm text-destructive">{operation.error}</div>}
              </div>
            );
          })}
        </div>
      </div>

      <div className="mt-5.5 border-t border-border pt-4.5">
        <div className="mb-1 text-base font-semibold">Preferred language</div>
        <div className="mb-2.5 text-sm leading-normal text-muted-foreground">
          Auto-detect evaluates every long-recording chunk independently. A different language can be chosen for an individual Reprocess attempt.
        </div>
        <Select
          className="min-w-45 self-start"
          value={settings.language}
          onChange={(event) => { void chooseLanguage(event.target.value); }}
        >
          {TRANSCRIPTION_LANGUAGE_OPTIONS.map(({ value, label }) => <option key={value} value={value}>{label}</option>)}
        </Select>
      </div>
      {error && <div className="text-sm text-destructive">{error}</div>}
    </div>
  );
}

