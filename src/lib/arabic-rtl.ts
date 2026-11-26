/**
 * Arabic RTL Alignment Manager for Discord Web
 *
 * Aligns Arabic (and mixed Arabic+English) message content to the right with
 * proper RTL flow, while keeping English messages LTR and code blocks LTR.
 */

const ARABIC_CHAR_RE = /[\u0600-\u06FF\u0750-\u077F\u08A0-\u08FF]/g;
const LATIN_CHAR_RE = /[A-Za-z]/g;
const URL_RE = /https?:\/\/\S+/g;
const LEADING_MENTION_RE = /^(?:@[^\s\n]+\s*)+/;

/**
 * Determines whether a Discord message text should render in RTL (right-aligned).
 * Handles leading @mentions and mixed Arabic+English sentences (e.g. "بنيت ال software factory الخاص بيا").
 */
export function isArabicMessageText(rawText: string): boolean {
  if (!rawText) return false;
  const cleaned = rawText
    .replace(URL_RE, ' ')
    .replace(LEADING_MENTION_RE, '')
    .trim();

  if (!cleaned) return false;

  const arabicMatches = cleaned.match(ARABIC_CHAR_RE);
  if (!arabicMatches || arabicMatches.length === 0) return false;

  // Find the first strong directional character (Arabic vs Latin)
  const firstArabicIdx = cleaned.search(ARABIC_CHAR_RE);
  const firstLatinIdx = cleaned.search(LATIN_CHAR_RE);

  if (firstArabicIdx !== -1 && (firstLatinIdx === -1 || firstArabicIdx < firstLatinIdx)) {
    return true;
  }

  const latinMatches = cleaned.match(LATIN_CHAR_RE);
  const latinCount = latinMatches ? latinMatches.length : 0;
  return arabicMatches.length / (arabicMatches.length + latinCount) >= 0.25;
}

export class ArabicRtlController {
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
      document.documentElement?.setAttribute('data-dce-rtl-arabic', 'true');
      document.body?.setAttribute('data-dce-rtl-arabic', 'true');
    } else {
      document.documentElement?.removeAttribute('data-dce-rtl-arabic');
      document.body?.removeAttribute('data-dce-rtl-arabic');
    }
  }

  scan(): void {
    if (typeof document === 'undefined') return;
    this.syncRootAttribute();
    if (!this.enabled) return;

    const nodes = document.querySelectorAll<HTMLElement>(
      'div[id^="message-content-"], div[class*="repliedTextContent_"]',
    );

    nodes.forEach((el) => {
      // Ignore code blocks when measuring whether the prose itself is Arabic
      let prose = '';
      el.childNodes.forEach((node) => {
        if (node.nodeType === Node.TEXT_NODE) {
          prose += node.textContent || '';
        } else if (node.nodeType === Node.ELEMENT_NODE) {
          const child = node as HTMLElement;
          if (
            child.tagName === 'PRE' ||
            child.className?.toString().includes('codeContainer_') ||
            child.className?.toString().includes('roleMention_') ||
            child.className?.toString().includes('mention')
          ) {
            return;
          }
          prose += ` ${child.textContent || ''}`;
        }
      });

      const rtl = isArabicMessageText(prose);
      if (rtl) {
        if (el.getAttribute('data-dce-rtl') !== 'true') {
          el.setAttribute('data-dce-rtl', 'true');
        }
      } else if (el.hasAttribute('data-dce-rtl')) {
        el.removeAttribute('data-dce-rtl');
      }
    });
  }
}
