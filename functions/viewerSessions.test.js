import assert from 'node:assert/strict';
import test from 'node:test';
import { updateViewerSession } from './viewerSessions.js';

const now = Date.parse('2026-01-01T00:00:00Z');
const link = { isActive: true, maxConcurrentViewers: 1 };
const viewer = { sessionId: 'viewer-a', pin: '', release: false };
const other = { ...viewer, sessionId: 'viewer-b' };

test('renueva la misma plaza y libera una plaza al cerrar el visor', () => {
  const first = updateViewerSession(link, {}, viewer, now);
  assert.equal(first.status, 'allowed');
  assert.equal(first.newViewer, true);
  assert.equal(updateViewerSession(link, first.state, other, now + 1).status, 'full');

  const renewal = updateViewerSession(link, first.state, viewer, now + 10_000);
  assert.equal(renewal.status, 'allowed');
  assert.equal(renewal.newViewer, false);
  assert.equal(renewal.state.slots.length, 1);
  const closed = updateViewerSession(link, renewal.state, { ...viewer, release: true }, now + 11_000);
  assert.equal(updateViewerSession(link, closed.state, other, now + 11_001).status, 'allowed');
});

test('una sesión abandonada caduca y un enlace borrado, pausado o vencido no se renueva', () => {
  const first = updateViewerSession(link, {}, viewer, now);
  assert.equal(updateViewerSession(link, first.state, other, now + first.leaseMs).status, 'allowed');
  assert.equal(updateViewerSession(undefined, first.state, viewer, now + 1).status, 'not_found');
  assert.equal(updateViewerSession({ ...link, isActive: false }, first.state, viewer, now + 1).status, 'inactive');

  const expiring = { ...link, expiresAtIso: new Date(now + 5_000).toISOString() };
  assert.equal(updateViewerSession(expiring, {}, viewer, now).leaseMs, 5_000);
  assert.equal(updateViewerSession(expiring, first.state, viewer, now + 5_000).status, 'expired');
});

test('valida el PIN antes de ocupar una plaza y frena intentos repetidos', () => {
  const protectedLink = { ...link, pinCode: '4193' };
  assert.equal(updateViewerSession(protectedLink, {}, viewer, now).status, 'pin_required');
  let state = {};
  for (let i = 0; i < 8; i++) {
    const denied = updateViewerSession(protectedLink, state, { ...viewer, pin: '0000' }, now + i);
    assert.equal(denied.status, 'invalid_pin');
    assert.deepEqual(denied.state.slots, []);
    state = denied.state;
  }
  assert.equal(updateViewerSession(protectedLink, state, { ...viewer, pin: '4193' }, now + 10).status, 'pin_locked');
  assert.equal(updateViewerSession(protectedLink, state, { ...viewer, pin: '4193' }, now + 300_000).status, 'allowed');
});

test('un cambio de PIN o una reducción del límite afecta a sesiones existentes', () => {
  const original = { ...link, pinCode: '4193', maxConcurrentViewers: 2 };
  const first = updateViewerSession(original, {}, { ...viewer, pin: '4193' }, now);
  const second = updateViewerSession(original, first.state, { ...other, pin: '4193' }, now);
  assert.equal(second.status, 'allowed');
  assert.equal(
    updateViewerSession({ ...original, maxConcurrentViewers: 1 }, second.state, { ...other, pin: '4193' }, now + 1).status,
    'full'
  );
  assert.equal(
    updateViewerSession({ ...original, pinCode: '6297' }, second.state, { ...viewer, pin: '4193' }, now + 1).status,
    'invalid_pin'
  );
});
