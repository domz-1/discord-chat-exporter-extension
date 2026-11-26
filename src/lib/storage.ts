import {
  STORAGE_KEY_HIDE_ACTIVITY,
  STORAGE_KEY_HIDE_MUTED,
  STORAGE_KEY_REACT_WORD,
  STORAGE_KEY_RTL_ARABIC,
} from './types';
import { DEFAULT_REACT_WORD } from './word-react';

async function getBooleanSetting(key: string, defaultValue: boolean): Promise<boolean> {
  if (typeof browser === 'undefined' || !browser.storage?.local) return defaultValue;
  try {
    const result = await browser.storage.local.get(key);
    const val = (result as Record<string, unknown>)?.[key];
    return typeof val === 'boolean' ? val : defaultValue;
  } catch {
    return defaultValue;
  }
}

async function setBooleanSetting(key: string, enabled: boolean): Promise<void> {
  if (typeof browser === 'undefined' || !browser.storage?.local) return;
  try {
    await browser.storage.local.set({ [key]: Boolean(enabled) });
  } catch {
    // Ignore storage write errors in restricted contexts
  }
}

function onBooleanSettingChanged(key: string, callback: (enabled: boolean) => void): () => void {
  if (typeof browser === 'undefined' || !browser.storage?.onChanged) return () => {};

  const listener = (
    changes: Record<string, { newValue?: unknown }>,
    areaName: string,
  ) => {
    if (areaName === 'local' && changes[key]) {
      const val = changes[key].newValue;
      if (typeof val === 'boolean') {
        callback(val);
      }
    }
  };

  browser.storage.onChanged.addListener(listener);
  return () => browser.storage.onChanged.removeListener(listener);
}

export const getHideMutedSetting = () => getBooleanSetting(STORAGE_KEY_HIDE_MUTED, true);
export const setHideMutedSetting = (enabled: boolean) => setBooleanSetting(STORAGE_KEY_HIDE_MUTED, enabled);
export const onHideMutedSettingChanged = (cb: (enabled: boolean) => void) =>
  onBooleanSettingChanged(STORAGE_KEY_HIDE_MUTED, cb);

export const getHideActivitySetting = () => getBooleanSetting(STORAGE_KEY_HIDE_ACTIVITY, true);
export const setHideActivitySetting = (enabled: boolean) =>
  setBooleanSetting(STORAGE_KEY_HIDE_ACTIVITY, enabled);
export const onHideActivitySettingChanged = (cb: (enabled: boolean) => void) =>
  onBooleanSettingChanged(STORAGE_KEY_HIDE_ACTIVITY, cb);

export const getRtlArabicSetting = () => getBooleanSetting(STORAGE_KEY_RTL_ARABIC, true);
export const setRtlArabicSetting = (enabled: boolean) =>
  setBooleanSetting(STORAGE_KEY_RTL_ARABIC, enabled);
export const onRtlArabicSettingChanged = (cb: (enabled: boolean) => void) =>
  onBooleanSettingChanged(STORAGE_KEY_RTL_ARABIC, cb);

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
