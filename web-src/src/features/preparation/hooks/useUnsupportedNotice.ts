import { useEffect } from 'react';
import { api, type OnboardingPreferences } from '@/common/api/api';
import { useAppActions } from '@/store/contexts/AppContext';

/**
 * The once-per-user notice about files StashBase cannot prepare.
 *
 * Two kinds of unsupported file are counted separately — source code and
 * everything else — and each is acknowledged with its own version number,
 * so adding a second category later still shows once rather than reusing a
 * flag the user already dismissed.
 *
 * The read decides whether to open; the write only records what was shown,
 * so a failed write is logged and swallowed. Blocking the close on it would
 * trap the user in a notice to persist the fact that they had seen it.
 */
export function useUnsupportedNotice(counts: { sourceCode: number; other: number }, folderKey: string) {
  const { dispatch } = useAppActions();
  const { sourceCode, other } = counts;
  const total = sourceCode + other;

  useEffect(() => {
    if (total === 0) return;
    let mounted = true;
    api.getOnboarding().then((prefs) => {
      if (!mounted) return;
      const needsSourceNotice = sourceCode > 0 && (prefs.sourceCodeNoticeVersion ?? 0) < 1;
      const needsOtherNotice = other > 0 && (prefs.unsupportedFormatsNoticeVersion ?? 0) < 1;
      if (needsSourceNotice || needsOtherNotice) {
        dispatch({ type: 'UNSUPPORTED_MODAL', open: true });
      }
    }).catch(() => {});
    return () => { mounted = false; };
  }, [dispatch, folderKey, total, sourceCode, other]);

  return async function acknowledge() {
    dispatch({ type: 'UNSUPPORTED_MODAL', open: false });
    const patch: Partial<OnboardingPreferences> = {};
    if (sourceCode > 0) patch.sourceCodeNoticeVersion = 1;
    if (other > 0) patch.unsupportedFormatsNoticeVersion = 1;
    if (Object.keys(patch).length > 0) {
      try {
        await api.putOnboarding(patch);
      } catch (err) {
        console.warn('Failed to update onboarding preferences', err);
      }
    }
  };
}
