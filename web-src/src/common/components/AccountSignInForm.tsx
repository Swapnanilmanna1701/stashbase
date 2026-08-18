import { useEffect, useRef, useState } from 'react';
import { errorMessage, type HostedAccountState } from '@/common/api/api';
import { signInWithStashBase } from '@/common/lib/accountOAuth';
import { Button } from '@/common/components/ui/button';
import { StatusMessage } from '@/common/components/ui/status';

export function AccountSignInForm({
  onSignedIn,
  onBack,
}: {
  onSignedIn: (account: HostedAccountState) => void;
  onBack?: () => void;
}) {
  const [busy, setBusy] = useState(true);
  const [browserOpened, setBrowserOpened] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const startedRef = useRef(false);
  const mountedRef = useRef(true);

  function start() {
    setBusy(true);
    setBrowserOpened(false);
    setError(null);
    void signInWithStashBase('google', {
      onBrowserOpened: () => { if (mountedRef.current) setBrowserOpened(true); },
    }).then((account) => {
      if (mountedRef.current) onSignedIn(account);
    }).catch((err: unknown) => {
      if (!mountedRef.current) return;
      setError(errorMessage(err));
      setBusy(false);
    });
  }

  useEffect(() => {
    mountedRef.current = true;
    if (!startedRef.current) {
      startedRef.current = true;
      start();
    }
    return () => {
      mountedRef.current = false;
    };
  }, []);

  return (
    <div>
      <div className="text-sm font-medium">
        {browserOpened ? 'Finish signing in with Google in your browser' : 'Opening Google sign-in…'}
      </div>
      <p className="mt-2 text-xs leading-relaxed text-muted-foreground">
        Supabase handles the provider login in your browser. Return here when it completes; StashBase will continue automatically.
      </p>
      {error && <StatusMessage tone="error" className="mt-2.5">{error}</StatusMessage>}
      <div className="mt-3.5 flex flex-wrap items-center gap-2">
        {onBack && <Button variant="ghost" disabled={busy} onClick={onBack}>Back</Button>}
        <Button disabled={busy} onClick={start}>
          {busy ? 'Waiting for Google…' : 'Continue with Google'}
        </Button>
      </div>
    </div>
  );
}
