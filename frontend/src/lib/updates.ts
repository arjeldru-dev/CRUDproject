import { CHANGELOG, type Release } from '../data/changelog';

/**
 * Lightweight, client-side "new update" tracking — keyed PER ACCOUNT so that
 * switching accounts in the same browser correctly re-surfaces an unseen update.
 *
 * The latest published release is the first entry in CHANGELOG. We remember the
 * version each user has seen in localStorage; when a newer release ships, that
 * user has an unseen update until they open the What's New page (or dismiss it).
 * The update also appears as a persistent entry in the notifications list —
 * once seen it simply shows as read rather than disappearing.
 */
const STORAGE_PREFIX = 'budgetbarkada:lastSeenUpdate';

export const latestRelease: Release | null = CHANGELOG.length > 0 ? CHANGELOG[0] : null;
export const latestUpdateVersion: string = latestRelease?.version ?? '';
export const latestUpdateTitle: string | undefined = latestRelease?.title;
export const latestUpdateDate: string = latestRelease?.date ?? '';

function keyFor(userId?: string | null): string {
  return userId ? `${STORAGE_PREFIX}:${userId}` : STORAGE_PREFIX;
}

/** True when a newer release exists than the one this user last saw. */
export function hasUnseenUpdate(userId?: string | null): boolean {
  if (!latestUpdateVersion) return false;
  try {
    return localStorage.getItem(keyFor(userId)) !== latestUpdateVersion;
  } catch {
    return false;
  }
}

/** Mark the current latest release as seen for this user (marks the entry read). */
export function markUpdatesSeen(userId?: string | null): void {
  try {
    localStorage.setItem(keyFor(userId), latestUpdateVersion);
  } catch {
    /* ignore storage errors (private mode, etc.) */
  }
}
