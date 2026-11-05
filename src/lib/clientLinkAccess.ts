import { useEffect, useState } from 'react';
import { GOOGLE_CLOUD_PROJECT_ID } from './firebase';
import type { Camera, ShareLink } from './types';

export type ClientLinkFailure =
  'not_found' | 'expired' | 'inactive' | 'pin_required' | 'invalid_pin' |
  'pin_locked' | 'full' | 'unavailable';

type ClientLinkAccess =
  | { status: 'loading' | ClientLinkFailure }
  | { status: 'allowed'; link: ShareLink; cameras: Camera[]; deadline: number };

const endpoint = import.meta.env.VITE_CLIENT_LINK_ENDPOINT ||
  `https://us-central1-${GOOGLE_CLOUD_PROJECT_ID}.cloudfunctions.net/openClientLink`;
const refreshMs = 10_000;
const failures = new Set<ClientLinkFailure>([
  'not_found', 'expired', 'inactive', 'pin_required', 'invalid_pin', 'pin_locked', 'full', 'unavailable',
]);

export function useClientLinkAccess(token?: string) {
  const [attempt, setAttempt] = useState({ pin: '' });
  const [access, setAccess] = useState<ClientLinkAccess>({ status: 'loading' });

  useEffect(() => {
    if (!token) return;
    const sessionId = crypto.randomUUID();
    const baseRequest = { token, sessionId };
    let controller: AbortController | undefined;
    let stopped = false;
    let refresh: ReturnType<typeof setTimeout> | undefined;
    let requestInProgress = false;
    let granted = false;
    let retry = true;
    setAccess({ status: 'loading' });

    const release = () => {
      if (!granted) return;
      granted = false;
      void fetch(endpoint, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ...baseRequest, release: true }),
        keepalive: true,
      }).catch(() => {});
    };

    const verify = async () => {
      if (requestInProgress || stopped || !retry) return;
      requestInProgress = true;
      clearTimeout(refresh);
      const startedAt = Date.now();
      controller = new AbortController();
      const request = controller;
      const timeout = setTimeout(() => request.abort(), 18_000);
      try {
        const response = await fetch(endpoint, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ ...baseRequest, pin: attempt.pin }),
          signal: request.signal,
        });
        if (stopped) return;
        const result = await response.json();
        if (stopped) return;
        if (response.ok && result.status === 'allowed' && result.link && Array.isArray(result.cameras) &&
          Number.isFinite(result.leaseMs) && result.leaseMs > 0) {
          granted = true;
          setAccess({
            status: 'allowed',
            link: result.link,
            cameras: result.cameras,
            deadline: startedAt + result.leaseMs,
          });
        } else {
          release();
          const status = failures.has(result.status) ? result.status as ClientLinkFailure : 'unavailable';
          retry = status === 'unavailable';
          setAccess({ status });
        }
      } catch {
        if (!stopped) setAccess({ status: 'unavailable' });
      } finally {
        clearTimeout(timeout);
        requestInProgress = false;
        if (retry && !stopped) refresh = setTimeout(verify, refreshMs);
      }
    };

    const onVisible = () => {
      if (document.visibilityState === 'visible') void verify();
    };
    const onPageHide = (event: PageTransitionEvent) => {
      if (!event.persisted) release();
    };
    void verify();
    document.addEventListener('visibilitychange', onVisible);
    window.addEventListener('pagehide', onPageHide);
    return () => {
      stopped = true;
      controller?.abort();
      clearTimeout(refresh);
      document.removeEventListener('visibilitychange', onVisible);
      window.removeEventListener('pagehide', onPageHide);
      release();
    };
  }, [token, attempt]);

  return { access, submitPin: (pin: string) => setAttempt({ pin: pin.trim() }) };
}
