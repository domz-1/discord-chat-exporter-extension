import { STORAGE_KEY_HIDE_MUTED } from './types';

export async function getHideMutedSetting(): Promise<boolean> {
  if (typeof browser === 'undefined' || !browser.storage?.local) return true;
  try {
    const result = await browser.storage.local.get(STORAGE_KEY_HIDE_MUTED);
    const val = (result as Record<string, unknown>)?.[STORAGE_KEY_HIDE_MUTED];
    return typeof val === 'boolean' ? val : true;
  } catch {
    return true;
  }
}

export async function setHideMutedSetting(enabled: boolean): Promise<void> {
  if (typeof browser === 'undefined' || !browser.storage?.local) return;
  try {
    await browser.storage.local.set({ [STORAGE_KEY_HIDE_MUTED]: Boolean(enabled) });
  } catch {
    // Ignore storage write errors in restricted contexts
  }
}

export function onHideMutedSettingChanged(callback: (enabled: boolean) => void): () => void {
  if (typeof browser === 'undefined' || !browser.storage?.onChanged) return () => {};

  const listener = (
    changes: Record<string, { newValue?: unknown }>,
    areaName: string,
  ) => {
    if (areaName === 'local' && changes[STORAGE_KEY_HIDE_MUTED]) {
      const val = changes[STORAGE_KEY_HIDE_MUTED].newValue;
      if (typeof val === 'boolean') {
        callback(val);
      }
    }
  };

  browser.storage.onChanged.addListener(listener);
  return () => browser.storage.onChanged.removeListener(listener);
}
