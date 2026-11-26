import { describe, expect, it } from 'bun:test';
import { isActivityHeaderElement } from '../src/lib/activity';
import { isArabicMessageText } from '../src/lib/arabic-rtl';

describe('Arabic RTL detection', () => {
  it('detects pure Arabic and mixed Arabic+English messages', () => {
    expect(isArabicMessageText('بنيت ال software factory الخاص بيا')).toBe(true);
    expect(isArabicMessageText('@QC @Backend Team للناس اللي شغالة على HeidiSQL')).toBe(true);
    expect(isArabicMessageText('دا لينك الريبو https://github.com/ameenmv/software-factory')).toBe(true);
    expect(isArabicMessageText('ممكن تختصر الطريق وتاخد my own software factory تضيف عليه')).toBe(true);
  });

  it('keeps pure English, URL-only, and code-only messages LTR', () => {
    expect(isArabicMessageText('Fixed the deployment pipeline and merged PR #42')).toBe(false);
    expect(isArabicMessageText('https://github.com/ameenmv/software-factory')).toBe(false);
    expect(isArabicMessageText('')).toBe(false);
  });
});

describe('Activity sidebar header detection', () => {
  it('identifies Discord Activity — N headers without matching Admins or Online groups', () => {
    const activityHeader = {
      tagName: 'H3',
      className: 'body-sm/medium_RAOoio membersGroup_86es0b container_kRH1UI',
      textContent: 'Activity — 1',
      querySelector(sel: string) {
        return sel.includes('headerContainer_') ? {} : null;
      },
    };
    const adminsHeader = {
      tagName: 'H3',
      className: 'body-sm/medium_RAOoio membersGroup_86es0b container_kRH1UI',
      textContent: 'Admins — 2',
      querySelector() {
        return null;
      },
    };
    const onlineHeader = {
      tagName: 'H3',
      className: 'body-sm/medium_RAOoio membersGroup_86es0b container_kRH1UI',
      textContent: 'Online — 16',
      querySelector() {
        return null;
      },
    };

    expect(isActivityHeaderElement(activityHeader)).toBe(true);
    expect(isActivityHeaderElement(adminsHeader)).toBe(false);
    expect(isActivityHeaderElement(onlineHeader)).toBe(false);
  });
});
