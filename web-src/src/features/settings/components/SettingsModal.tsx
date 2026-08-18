import { useEffect, useState } from 'react';
import { lazyWithRetry } from '@/common/components/ErrorBoundary';
import { LazyManagedModal } from '@/common/components/LazyManaged';
import { OPEN_SETTINGS_EVENT, type SettingsOpenDetail, type SettingsSection } from '@/common/lib/settingsTrigger';
import { OVERLAY_BLOCKING_EVENT } from '@/common/hooks/useSettingsBlocking';

export interface SettingsModalProps {
  initialSection: SettingsSection;
  isTopmost: boolean;
  onClose: () => void;
}

const ManagedSettingsModal = lazyWithRetry(() => import('@/features/settings/components/ManagedSettingsModal'));

/** Event ownership stays eager; the managed dialog and settings panels load
 * only when Settings is first opened. */
export function SettingsPortal() {
  const [open, setOpen] = useState(false);
  const [section, setSection] = useState<SettingsSection>('appearance');

  useEffect(() => {
    window.dispatchEvent(new CustomEvent<boolean>(OVERLAY_BLOCKING_EVENT, { detail: open }));
    return () => {
      window.dispatchEvent(new CustomEvent<boolean>(OVERLAY_BLOCKING_EVENT, { detail: false }));
    };
  }, [open]);

  useEffect(() => {
    function onOpen(event: Event) {
      const detail = (event as CustomEvent<SettingsOpenDetail>).detail;
      if (detail?.section) setSection(detail.section);
      setOpen(true);
    }
    window.addEventListener(OPEN_SETTINGS_EVENT, onOpen);
    return () => {
      window.removeEventListener(OPEN_SETTINGS_EVENT, onOpen);
    };
  }, []);

  if (!open) return null;
  return (
    <LazyManagedModal
      as={ManagedSettingsModal}
      open
      label="Opening Settings…"
      onCancel={() => setOpen(false)}
      componentProps={{ initialSection: section, onClose: () => setOpen(false) }}
    />
  );
}
