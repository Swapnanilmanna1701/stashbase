import {
  type AppearanceScale,
  type AppearanceTheme,
} from '@/common/api/apiTypes';
import { useAppearanceSettings } from '@/features/settings/hooks/useAppearanceSettings';
import { SegmentedControl, SegmentedControlItem } from '@/common/components/ui/segmented-control';

const THEMES: Array<{ value: AppearanceTheme; label: string; hint: string }> = [
  { value: 'system', label: 'System', hint: 'Follow your operating system.' },
  { value: 'light', label: 'Light', hint: 'Always use the light appearance.' },
  { value: 'dark', label: 'Dark', hint: 'Always use the dark appearance.' },
];

const SCALES: Array<{ value: AppearanceScale; label: string }> = [
  { value: 'small', label: 'Small' },
  { value: 'default', label: 'Default' },
  { value: 'large', label: 'Large' },
];

function PresetGroup<T extends string>({
  label,
  value,
  choices,
  onChange,
  disabled,
  hint,
}: {
  label: string;
  value: T;
  choices: Array<{ value: T; label: string; hint?: string }>;
  onChange: (value: T) => void;
  disabled: boolean;
  hint?: string;
}) {
  return (
    <div className="mt-5.5">
      <div className="mb-1.5 text-base font-semibold">{label}</div>
      <SegmentedControl
        aria-label={label}
        disabled={disabled}
        value={[value]}
        onValueChange={(next) => {
          const choice = next[0] as T | undefined;
          if (choice && choice !== value) onChange(choice);
        }}
      >
        {choices.map((choice) => (
          <SegmentedControlItem
            key={choice.value}
            value={choice.value}
            className="min-w-18"
            title={choice.hint}
          >
            {choice.label}
          </SegmentedControlItem>
        ))}
      </SegmentedControl>
      {hint && <div className="mt-1.5 text-sm leading-normal text-muted-foreground">{hint}</div>}
    </div>
  );
}

export function AppearancePanel() {
  const { preferences, error, saving, save } = useAppearanceSettings();

  if (!preferences) {
    return error
      ? <div className="text-sm text-destructive">Couldn’t load appearance: {error}</div>
      : <div className="py-3 text-base text-muted-foreground">Loading…</div>;
  }
  return (
    <div>
      <div className="mb-1 text-base font-semibold">Appearance</div>
      <div className="text-sm leading-normal text-muted-foreground">
        Choose a clear, durable presentation preset. Changes apply immediately and are saved for every window.
      </div>
      <PresetGroup label="Theme" value={preferences.theme} choices={THEMES} disabled={saving} onChange={(theme) => { void save({ theme }); }} />
      <PresetGroup label="Interface size" value={preferences.uiScale} choices={SCALES} disabled={saving} onChange={(uiScale) => { void save({ uiScale }); }} hint="Scales app controls and chrome without changing document text." />
      <PresetGroup label="Reading text size" value={preferences.readingTextSize} choices={SCALES} disabled={saving} onChange={(readingTextSize) => { void save({ readingTextSize }); }} hint="Changes Markdown reading and editing text without affecting the interface." />
      {error && <div className="mt-2.5 text-sm text-destructive">Couldn’t save appearance: {error}</div>}
    </div>
  );
}
