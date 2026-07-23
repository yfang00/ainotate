import { useState, useEffect, useCallback } from 'react';
import { getItem, setItem } from '../utils/storage';

declare const __APP_VERSION__: string;

export interface FeatureHighlight {
  title: string;
  description: string;
}

export interface UpdateInfo {
  currentVersion: string;
  latestVersion: string;
  updateAvailable: boolean;
  dismissed: boolean;
  releaseUrl: string;
  featureHighlight?: FeatureHighlight;
  dismiss: () => void;
}

interface VersionCheckResult {
  currentVersion: string;
  latestVersion: string;
  updateAvailable: boolean;
  releaseUrl: string;
  featureHighlight?: FeatureHighlight;
}

const GITHUB_API = 'https://api.github.com/repos/backnotprop/ainotate/releases/latest';

const DISMISSED_VERSION_KEY = 'update-dismissed-version';

// Feature highlights for milestone releases
const FEATURE_HIGHLIGHTS: Record<string, FeatureHighlight> = {
  '0.5.0': {
    title: 'Code Review is here!',
    description: 'Review git diffs with inline annotations. Run /ainotate-review to try it.',
  },
};

function compareVersions(current: string, latest: string): boolean {
  const cleanVersion = (v: string) => v.replace(/^v/, '');
  const currentParts = cleanVersion(current).split('.').map(Number);
  const latestParts = cleanVersion(latest).split('.').map(Number);

  for (let i = 0; i < Math.max(currentParts.length, latestParts.length); i++) {
    const curr = currentParts[i] || 0;
    const lat = latestParts[i] || 0;
    if (lat > curr) return true;
    if (lat < curr) return false;
  }
  return false;
}

function isDismissedVersion(latestVersion: string): boolean {
  const dismissed = getItem(DISMISSED_VERSION_KEY);
  if (!dismissed) return false;
  const cleanLatest = latestVersion.replace(/^v/, '');
  const cleanDismissed = dismissed.replace(/^v/, '');
  return cleanLatest === cleanDismissed;
}

export function useUpdateCheck(): UpdateInfo | null {
  const [checkResult, setCheckResult] = useState<VersionCheckResult | null>(null);
  const [dismissed, setDismissed] = useState(false);

  const dismiss = useCallback(() => {
    if (!checkResult?.latestVersion) return;
    const clean = checkResult.latestVersion.replace(/^v/, '');
    setItem(DISMISSED_VERSION_KEY, clean);
    setDismissed(true);
  }, [checkResult?.latestVersion]);

  useEffect(() => {
    // Update checks disabled in this fork: no network call to the upstream
    // GitHub repo and no update / "what's new" nag. checkResult stays null, so
    // the hook always reports "no update available".
  }, []);

  if (!checkResult) return null;

  return {
    ...checkResult,
    dismissed,
    dismiss,
  };
}
