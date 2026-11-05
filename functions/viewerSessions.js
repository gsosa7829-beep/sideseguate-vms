import { timingSafeEqual } from 'node:crypto';

const LEASE_MS = 40_000;
const PIN_WINDOW_MS = 5 * 60_000;
const MAX_PIN_ATTEMPTS = 8;

function pinMatches(expected, provided) {
  const expectedBytes = Buffer.from(expected);
  const providedBytes = Buffer.from(provided);
  return expectedBytes.length === providedBytes.length && timingSafeEqual(expectedBytes, providedBytes);
}

export function updateViewerSession(link, state, { sessionId, pin, release }, now) {
  const slots = (state.slots || []).filter((slot) => slot.expiresAt > now);
  if (release) {
    const remaining = slots.filter((slot) => slot.id !== sessionId);
    return { status: 'released', state: { ...state, slots: remaining } };
  }

  if (!link) return { status: 'not_found' };
  if (!link.isActive) return { status: 'inactive' };
  const expiration = link.expiresAtIso ? Date.parse(link.expiresAtIso) : Infinity;
  if (Number.isNaN(expiration) || expiration <= now) return { status: 'expired' };

  const index = slots.findIndex((slot) => slot.id === sessionId);
  const expectedPin = String(link.pinCode || '').trim();
  const pinWindowUntil = state.pinWindowUntil > now ? state.pinWindowUntil : now + PIN_WINDOW_MS;
  const pinFailures = state.pinWindowUntil > now ? state.pinFailures || 0 : 0;

  if (expectedPin) {
    if (!pin) return { status: 'pin_required' };
    if (index === -1 && pinFailures >= MAX_PIN_ATTEMPTS) return { status: 'pin_locked' };
    if (!pinMatches(expectedPin, pin)) {
      // Un cambio de PIN revoca también las sesiones que ya estaban activas.
      const remaining = slots.filter((slot) => slot.id !== sessionId);
      return {
        status: 'invalid_pin',
        state: { slots: remaining, pinWindowUntil, pinFailures: pinFailures + 1 },
      };
    }
  }

  const configuredLimit = Number(link.maxConcurrentViewers);
  const limit = Number.isInteger(configuredLimit) && configuredLimit > 0
    ? Math.min(100, configuredLimit)
    : 3;
  if (index >= limit || (index === -1 && slots.length >= limit)) return { status: 'full' };

  const expiresAt = Math.min(now + LEASE_MS, expiration);
  const slot = { id: sessionId, expiresAt };
  if (index === -1) slots.push(slot);
  else slots[index] = slot;
  return {
    status: 'allowed',
    newViewer: index === -1,
    leaseMs: expiresAt - now,
    state: { slots, pinWindowUntil, pinFailures },
  };
}
