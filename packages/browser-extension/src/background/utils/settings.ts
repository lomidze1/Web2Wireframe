import { DEFAULT_SETTINGS, STORAGE_KEYS } from "@/shared/constants";

/**
 * Read the persisted extension settings, merged on top of defaults.
 * Always returns a complete settings object — callers can safely access
 * any field without checking for `undefined`.
 */
export async function getSettings() {
  const result = await chrome.storage.local.get(STORAGE_KEYS.SETTINGS);
  return { ...DEFAULT_SETTINGS, ...result[STORAGE_KEYS.SETTINGS] };
}

/**
 * Patch-merge new fields into the persisted settings. Re-reads first so a
 * concurrent write from another context (options page) isn't clobbered.
 */
export async function updateSettings(settings: object): Promise<void> {
  const current = await getSettings();
  await chrome.storage.local.set({
    [STORAGE_KEYS.SETTINGS]: { ...current, ...settings },
  });
}
