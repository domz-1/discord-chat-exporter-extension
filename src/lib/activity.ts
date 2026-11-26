/**
 * Activity Sidebar Hiding Manager
 *
 * Hides:
 * 1. The "Activity — N" header + all expanded activity cards at the top of the
 *    server Members sidebar (without affecting Admins / Online / Offline members).
 * 2. The "Active Now" sidebar column on the Friends page (`nowPlayingColumn_`).
 */

const ACTIVITY_HEADER_TEXT_RE = /^activity\s*[—–-]/i;

interface ActivityInspectable {
  tagName?: string;
  className?: string;
  textContent?: string | null;
  querySelector?: (selector: string) => unknown;
}

export function isActivityHeaderElement(el: ActivityInspectable | null): boolean {
  if (!el) return false;
  const cls = typeof el.className === 'string' ? el.className : '';
  if (!cls.includes('membersGroup_')) return false;

  if (typeof el.querySelector === 'function' && el.querySelector('[class*="headerContainer_"]')) {
    return true;
  }

  const text = (el.textContent || '').trim();
  return ACTIVITY_HEADER_TEXT_RE.test(text);
}

export class ActivitySidebarController {
  private enabled = true;

  isEnabled(): boolean {
    return this.enabled;
  }

  setEnabled(enabled: boolean): void {
    this.enabled = Boolean(enabled);
    this.syncRootAttribute();
    this.scan();
  }

  syncRootAttribute(): void {
    if (typeof document === 'undefined') return;
    if (this.enabled) {
      document.documentElement?.setAttribute('data-dce-hide-activity', 'true');
      document.body?.setAttribute('data-dce-hide-activity', 'true');
    } else {
      document.documentElement?.removeAttribute('data-dce-hide-activity');
      document.body?.removeAttribute('data-dce-hide-activity');
    }
  }

  scan(): void {
    if (typeof document === 'undefined') return;
    this.syncRootAttribute();

    const membersContent = document.querySelector(
      '[role="list"][aria-label="Members"] > [class*="content_"], [class*="members_"] > [class*="content_"]',
    );

    if (!membersContent) return;

    const children = Array.from(membersContent.children);
    let insideActivitySection = false;

    for (const child of children) {
      const cls = typeof child.className === 'string' ? child.className : '';
      const isGroupHeader = child.tagName === 'H3' && cls.includes('membersGroup_');

      if (isGroupHeader) {
        insideActivitySection = isActivityHeaderElement(child as unknown as ActivityInspectable);
      }

      if (insideActivitySection) {
        if (child.getAttribute('data-dce-activity') !== 'true') {
          child.setAttribute('data-dce-activity', 'true');
        }
      } else if (child.hasAttribute('data-dce-activity')) {
        child.removeAttribute('data-dce-activity');
      }
    }
  }
}
