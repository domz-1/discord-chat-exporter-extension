import { STORAGE_KEY_HIDE_MUTED, STORAGE_KEY_REACT_WORD } from './types';
import { DEFAULT_REACT_WORD } from './word-react';

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

export async function getReactWordSetting(): Promise<string> {
  if (typeof browser === 'undefined' || !browser.storage?.local) return DEFAULT_REACT_WORD;
  try {
    const result = await browser.storage.local.get(STORAGE_KEY_REACT_WORD);
    const val = (result as Record<string, unknown>)?.[STORAGE_KEY_REACT_WORD];
    return typeof val === 'string' && val.trim().length > 0 ? val : DEFAULT_REACT_WORD;
  } catch {
    return DEFAULT_REACT_WORD;
  }
}

export async function setReactWordSetting(word: string): Promise<void> {
  if (typeof browser === 'undefined' || !browser.storage?.local) return;
  try {
    await browser.storage.local.set({ [STORAGE_KEY_REACT_WORD]: word });
  } catch {
    // Ignore storage write errors in restricted contexts
  }
}

export function onReactWordSettingChanged(callback: (word: string) => void): () => void {
  if (typeof browser === 'undefined' || !browser.storage?.onChanged) return () => {};

  const listener = (
    changes: Record<string, { newValue?: unknown }>,
    areaName: string,
  ) => {
    if (areaName === 'local' && changes[STORAGE_KEY_REACT_WORD]) {
      const val = changes[STORAGE_KEY_REACT_WORD].newValue;
      if (typeof val === 'string') {
        callback(val);
      }
    }
  };

  browser.storage.onChanged.addListener(listener);
  return () => browser.storage.onChanged.removeListener(listener);
}
