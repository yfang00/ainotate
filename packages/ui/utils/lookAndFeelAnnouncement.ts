/**
 * Tracks whether the user has seen the UI 2.0 "look & feel" refresh announcement.
 * Uses cookies so the dismissal survives Ainotate's random localhost ports.
 */

import { storage } from './storage';

const STORAGE_KEY = 'ainotate-look-feel-announcement-seen';
// v2: grid is the default again; the dialog became a grid-vs-clean image chooser.
const CURRENT_VERSION = '2';

export function needsLookAndFeelAnnouncement(): boolean {
  // Onboarding/promo announcement disabled in this fork — never show the
  // "what's new / choose your plan look / workspaces are coming" modal.
  return false;
}

export function markLookAndFeelAnnouncementSeen(): void {
  storage.setItem(STORAGE_KEY, CURRENT_VERSION);
}
