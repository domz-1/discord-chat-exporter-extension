/**
 * Muted Channels, Categories & Direct Messages Hiding Manager
 *
 * Uses `data-dce-hide-muted="true"` on `<html>` (NOT a class, because Discord's
 * React root overwrites `document.documentElement.className` on theme/focus updates).
 */

const MUTED_CLASS_TOKEN_RE = /(?:^|\s)(?:modeMuted_|muted_)/;

interface MutedInspectable {
  className?: string;
  querySelector?: (selector: string) => unknown;
  querySelectorAll?: (selector: string) => Iterable<{ className?: string }>;
}

/**
 * Checks whether a sidebar row (server channel, server category, or DM / Group DM)
 * is marked as muted by Discord.
 */
export function isMutedSidebarItem(el: MutedInspectable | null): boolean {
  if (!el) return false;
  const cls = typeof el.className === 'string' ? el.className : '';
  if (MUTED_CLASS_TOKEN_RE.test(cls)) return true;

  if (typeof el.querySelector === 'function') {
    if (el.querySelector('[class*="modeMuted_"]')) return true;
  }

  if (typeof el.querySelectorAll === 'function') {
    for (const child of el.querySelectorAll('[class*="muted_"]')) {
      const childCls = typeof child.className === 'string' ? child.className : '';
      if (MUTED_CLASS_TOKEN_RE.test(childCls)) {
        return true;
      }
    }
  } else if (typeof el.querySelector === 'function') {
    const match = el.querySelector('[class*="muted_"]') as { className?: string } | null;
    if (match && MUTED_CLASS_TOKEN_RE.test(String(match.className || ''))) {
      return true;
    }
  }

  return false;
}

export class MutedChannelsController {
  private enabled = true;
  private sidebarObservers = new Map<Element, MutationObserver>();
  private onMutate: () => void;

  constructor(onMutate: () => void) {
    this.onMutate = onMutate;
  }

  isEnabled(): boolean {
    return this.enabled;
  }

  setEnabled(enabled: boolean): void {
    this.enabled = Boolean(enabled);
    this.syncRootAttribute();
    this.scan();
  }

  /**
   * Re-asserts `data-dce-hide-muted` attribute (immune to Discord className overwrites).
   */
  syncRootAttribute(): void {
    if (typeof document === 'undefined') return;
    if (this.enabled) {
      document.documentElement?.setAttribute('data-dce-hide-muted', 'true');
      document.body?.setAttribute('data-dce-hide-muted', 'true');
    } else {
      document.documentElement?.removeAttribute('data-dce-hide-muted');
      document.body?.removeAttribute('data-dce-hide-muted');
    }
  }

  /**
   * Scans both server channel sidebars (`#channels`) and Direct Message lists
   * (`[class*="privateChannels_"]`, `ul[aria-label="Direct Messages"]`).
   */
  scan(): void {
    if (typeof document === 'undefined') return;
    this.syncRootAttribute();

    const roots = new Set<Element>();
    const channelsEl = document.getElementById('channels');
    if (channelsEl) roots.add(channelsEl);

    document
      .querySelectorAll(
        'nav[aria-label*="(server)"], nav[aria-label*="Private"], [class*="privateChannels_"], ul[aria-label="Direct Messages"], ul[aria-label="Channels"]',
      )
      .forEach((r) => roots.add(r));

    // Clean up observers for detached roots
    for (const [root, obs] of this.sidebarObservers.entries()) {
      if (!document.contains(root) || !roots.has(root)) {
        obs.disconnect();
        this.sidebarObservers.delete(root);
      }
    }

    for (const root of roots) {
      if (!this.sidebarObservers.has(root)) {
        const obs = new MutationObserver(() => this.onMutate());
        obs.observe(root, {
          attributes: true,
          attributeFilter: ['class'],
          childList: true,
          subtree: true,
        });
        this.sidebarObservers.set(root, obs);
      }

      const items = root.querySelectorAll(
        'li[class*="containerDefault_"], div[class*="containerDefault_"], li[class*="containerDrag"], li[data-dnd-name], li[class*="typeThread_"], li[class*="container_"], li[class*="channel_"], li[role="listitem"]',
      );

      items.forEach((item) => {
        const muted = isMutedSidebarItem(item as unknown as MutedInspectable);
        if (muted) {
          if (item.getAttribute('data-dce-muted') !== 'true') {
            item.setAttribute('data-dce-muted', 'true');
          }
        } else if (item.hasAttribute('data-dce-muted')) {
          item.removeAttribute('data-dce-muted');
        }
      });
    }
  }

  disconnect(): void {
    for (const obs of this.sidebarObservers.values()) {
      obs.disconnect();
    }
    this.sidebarObservers.clear();
  }
}
