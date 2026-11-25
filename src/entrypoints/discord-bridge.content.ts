import {
  buildForwardPayload,
  isDiscordMessagesEndpoint,
  isForwardRequestBody,
} from '../lib/forward';
import {
  EVENT_ARM_FORWARD,
  EVENT_DISARM_FORWARD,
  EVENT_FORWARD_PROGRESS,
  EVENT_WORD_REACT,
  EVENT_WORD_REACT_PROGRESS,
  type ForwardProgressDetail,
  type ForwardSessionPayload,
  type ForwardTargetRef,
  type WordReactProgressDetail,
  type WordReactRequestPayload,
} from '../lib/types';
import { buildReactionEndpoint } from '../lib/word-react';

interface ArmedSession {
  sessionId: string;
  messages: ForwardTargetRef[];
  triggered: boolean;
  disarmTimer: ReturnType<typeof setTimeout> | null;
}

interface TrackedXhr extends XMLHttpRequest {
  __dceMethod?: string;
  __dceUrl?: string;
  __dceHeaders?: Record<string, string>;
  __dceInternal?: boolean;
}

function isDiscordApiUrl(url: string): boolean {
  return /^(?:https:\/\/(?:[a-z]+\.)?discord\.com)?\/api\/v\d+\//.test(url);
}

export default defineContentScript({
  matches: ['https://discord.com/*'],
  world: 'MAIN',
  runAt: 'document_start',

  main() {
    if ((window as unknown as Record<string, unknown>).__DCE_BRIDGE_INSTALLED__) {
      return;
    }
    (window as unknown as Record<string, unknown>).__DCE_BRIDGE_INSTALLED__ = true;

    let activeSession: ArmedSession | null = null;
    // Transient in-memory copy of Discord's own session headers for this tab only
    let lastApiHeaders: Record<string, string> | null = null;

    const origXhrOpen = XMLHttpRequest.prototype.open;
    const origXhrSetHeader = XMLHttpRequest.prototype.setRequestHeader;
    const origXhrSend = XMLHttpRequest.prototype.send;
    const origFetch = window.fetch.bind(window);

    function captureSessionHeaders(url: string, headers: Record<string, string>) {
      if (!isDiscordApiUrl(url)) return;
      const hasAuth = Object.keys(headers).some((k) => k.toLowerCase() === 'authorization');
      if (!hasAuth) return;
      const cleaned: Record<string, string> = {};
      for (const [k, v] of Object.entries(headers)) {
        const lower = k.toLowerCase();
        if (lower === 'content-length' || lower === 'content-type') continue;
        cleaned[k] = v;
      }
      lastApiHeaders = cleaned;
    }

    function emitForwardProgress(detail: ForwardProgressDetail) {
      window.dispatchEvent(new CustomEvent(EVENT_FORWARD_PROGRESS, { detail }));
    }

    function emitReactProgress(detail: WordReactProgressDetail) {
      window.dispatchEvent(new CustomEvent(EVENT_WORD_REACT_PROGRESS, { detail }));
    }

    function sleep(ms: number): Promise<void> {
      return new Promise((resolve) => setTimeout(resolve, ms));
    }

    function sendXhrRequest(
      method: 'POST' | 'PUT',
      url: string,
      headers: Record<string, string>,
      bodyStr: string | null = null,
    ): Promise<{ status: number; responseText: string }> {
      return new Promise((resolve) => {
        const xhr = new XMLHttpRequest() as TrackedXhr;
        xhr.__dceInternal = true;
        origXhrOpen.call(xhr, method, url, true);
        xhr.withCredentials = true;

        for (const [k, v] of Object.entries(headers)) {
          if (k.toLowerCase() === 'content-length') continue;
          try {
            origXhrSetHeader.call(xhr, k, v);
          } catch {
            // Skip forbidden browser-managed headers
          }
        }
        if (bodyStr !== null && !Object.keys(headers).some((k) => k.toLowerCase() === 'content-type')) {
          try {
            origXhrSetHeader.call(xhr, 'Content-Type', 'application/json');
          } catch {
            // Ignore
          }
        }

        xhr.onload = () => resolve({ status: xhr.status, responseText: xhr.responseText });
        xhr.onerror = () => resolve({ status: 0, responseText: '' });
        origXhrSend.call(xhr, bodyStr);
      });
    }

    async function runWordReact(payload: WordReactRequestPayload) {
      const { requestId, channelId, messageId, emojis } = payload;
      const total = emojis.length;
      if (!total) {
        emitReactProgress({ requestId, sent: 0, total: 0, failed: 0, done: true });
        return;
      }

      if (!lastApiHeaders) {
        emitReactProgress({
          requestId,
          sent: 0,
          total,
          failed: total,
          done: true,
          error: 'Wait a moment for Discord to sync, then click again',
        });
        return;
      }

      const headers = { ...lastApiHeaders };
      let sent = 0;
      let failed = 0;

      for (let i = 0; i < emojis.length; i++) {
        const emoji = emojis[i]!;
        if (i > 0) {
          await sleep(340);
        }

        let url = buildReactionEndpoint(channelId, messageId, emoji);
        let res = await sendXhrRequest('PUT', url, headers, null);

        // Fallback: if Discord rejects variation selector \uFE0F with 400, retry stripped once
        if (res.status === 400 && emoji.includes('\uFE0F')) {
          const stripped = emoji.replace(/\uFE0F/g, '');
          url = buildReactionEndpoint(channelId, messageId, stripped);
          res = await sendXhrRequest('PUT', url, headers, null);
        }

        // Respect Discord 429 rate-limit Retry-After once automatically
        if (res.status === 429) {
          let waitMs = 1200;
          try {
            const parsed = JSON.parse(res.responseText) as { retry_after?: number };
            if (typeof parsed.retry_after === 'number') {
              waitMs = Math.ceil(parsed.retry_after * 1000) + 180;
            }
          } catch {
            // Fallback delay
          }
          await sleep(waitMs);
          res = await sendXhrRequest('PUT', url, headers, null);
        }

        if (res.status >= 200 && res.status < 300) {
          sent++;
        } else {
          failed++;
        }

        emitReactProgress({
          requestId,
          sent,
          total,
          failed,
          done: false,
        });
      }

      emitReactProgress({
        requestId,
        sent,
        total,
        failed,
        done: true,
        error: failed > 0 && sent === 0 ? 'Reaction request failed' : undefined,
      });
    }

    async function replayRemainingMessages(
      sessionId: string,
      url: string,
      headers: Record<string, string>,
      baseBody: Record<string, unknown>,
      remaining: ForwardTargetRef[],
      totalCount: number,
    ) {
      let sent = totalCount - remaining.length;
      let failed = 0;

      emitForwardProgress({ sessionId, sent, total: totalCount, done: false });

      for (const target of remaining) {
        await sleep(380);
        const payload = buildForwardPayload(baseBody, target, { preserveContent: false });
        const bodyStr = JSON.stringify(payload);

        let res = await sendXhrRequest('POST', url, headers, bodyStr);

        if (res.status === 429) {
          let waitMs = 1500;
          try {
            const parsed = JSON.parse(res.responseText) as { retry_after?: number };
            if (typeof parsed.retry_after === 'number') {
              waitMs = Math.ceil(parsed.retry_after * 1000) + 200;
            }
          } catch {
            // Use fallback delay
          }
          await sleep(waitMs);
          res = await sendXhrRequest('POST', url, headers, bodyStr);
        }

        if (res.status >= 200 && res.status < 300) {
          sent++;
        } else {
          failed++;
        }

        emitForwardProgress({
          sessionId,
          sent,
          total: totalCount,
          failed,
          done: false,
        });
      }

      emitForwardProgress({
        sessionId,
        sent,
        total: totalCount,
        failed,
        done: true,
      });
    }

    function scheduleAutoDisarm(session: ArmedSession) {
      if (session.disarmTimer) clearTimeout(session.disarmTimer);
      session.disarmTimer = setTimeout(() => {
        if (activeSession?.sessionId === session.sessionId) {
          activeSession = null;
        }
      }, 2500);
    }

    // Listen for arm/disarm forward & word-react commands from isolated content script
    window.addEventListener(EVENT_ARM_FORWARD, (evt: Event) => {
      const detail = (evt as CustomEvent<ForwardSessionPayload>).detail;
      if (!detail || !Array.isArray(detail.messages) || detail.messages.length === 0) return;

      if (activeSession?.disarmTimer) clearTimeout(activeSession.disarmTimer);
      activeSession = {
        sessionId: detail.sessionId,
        messages: detail.messages,
        triggered: false,
        disarmTimer: null,
      };
    });

    window.addEventListener(EVENT_DISARM_FORWARD, (evt: Event) => {
      const detail = (evt as CustomEvent<{ sessionId?: string }>).detail;
      if (!activeSession) return;
      if (!detail?.sessionId || activeSession.sessionId === detail.sessionId) {
        if (activeSession.disarmTimer) clearTimeout(activeSession.disarmTimer);
        activeSession = null;
      }
    });

    window.addEventListener(EVENT_WORD_REACT, (evt: Event) => {
      const detail = (evt as CustomEvent<WordReactRequestPayload>).detail;
      if (!detail || !detail.channelId || !detail.messageId || !Array.isArray(detail.emojis)) return;
      void runWordReact(detail);
    });

    // --- Hook 1: XMLHttpRequest (Discord Web's primary superagent transport) ---
    XMLHttpRequest.prototype.open = function (
      this: TrackedXhr,
      method: string,
      url: string | URL,
      ...rest: unknown[]
    ) {
      this.__dceMethod = typeof method === 'string' ? method.toUpperCase() : '';
      this.__dceUrl = typeof url === 'string' ? url : String(url);
      this.__dceHeaders = {};
      return (origXhrOpen as (...args: unknown[]) => unknown).call(this, method, url, ...rest);
    } as typeof XMLHttpRequest.prototype.open;

    XMLHttpRequest.prototype.setRequestHeader = function (
      this: TrackedXhr,
      name: string,
      value: string,
    ) {
      if (this.__dceHeaders) {
        this.__dceHeaders[name] = value;
      }
      return origXhrSetHeader.call(this, name, value);
    };

    XMLHttpRequest.prototype.send = function (
      this: TrackedXhr,
      body?: Document | XMLHttpRequestBodyInit | null,
    ) {
      if (!this.__dceInternal && this.__dceUrl && this.__dceHeaders) {
        captureSessionHeaders(this.__dceUrl, this.__dceHeaders);
      }

      if (
        !activeSession ||
        this.__dceInternal ||
        this.__dceMethod !== 'POST' ||
        !this.__dceUrl ||
        !isDiscordMessagesEndpoint(this.__dceUrl) ||
        typeof body !== 'string'
      ) {
        return origXhrSend.call(this, body);
      }

      let parsedBody: unknown;
      try {
        parsedBody = JSON.parse(body);
      } catch {
        return origXhrSend.call(this, body);
      }

      if (!isForwardRequestBody(parsedBody)) {
        return origXhrSend.call(this, body);
      }

      const session = activeSession;
      session.triggered = true;
      scheduleAutoDisarm(session);

      const firstTarget = session.messages[0];
      const remaining = session.messages.slice(1);
      const capturedUrl = this.__dceUrl;
      const capturedHeaders = { ...(this.__dceHeaders || {}) };

      const currentRef = parsedBody.message_reference as { message_id?: string };
      let outgoingBodyStr = body;
      if (firstTarget && currentRef.message_id !== firstTarget.messageId) {
        const swapped = buildForwardPayload(parsedBody, firstTarget, { preserveContent: true });
        outgoingBodyStr = JSON.stringify(swapped);
      }

      if (remaining.length > 0) {
        this.addEventListener(
          'load',
          () => {
            if (this.status >= 200 && this.status < 300) {
              void replayRemainingMessages(
                session.sessionId,
                capturedUrl,
                capturedHeaders,
                parsedBody,
                remaining,
                session.messages.length,
              );
            } else {
              emitForwardProgress({
                sessionId: session.sessionId,
                sent: 0,
                total: session.messages.length,
                failed: session.messages.length,
                done: true,
                error: `Forward failed (${this.status})`,
              });
            }
          },
          { once: true },
        );
      } else {
        this.addEventListener(
          'load',
          () => {
            const ok = this.status >= 200 && this.status < 300;
            emitForwardProgress({
              sessionId: session.sessionId,
              sent: ok ? 1 : 0,
              total: 1,
              failed: ok ? 0 : 1,
              done: true,
            });
          },
          { once: true },
        );
      }

      return origXhrSend.call(this, outgoingBodyStr);
    };

    // --- Hook 2: window.fetch ---
    window.fetch = (async (input: RequestInfo | URL, init?: RequestInit): Promise<Response> => {
      const url = typeof input === 'string' ? input : input instanceof URL ? input.href : input.url;

      if (init?.headers && isDiscordApiUrl(url)) {
        const hdrObj: Record<string, string> = {};
        new Headers(init.headers).forEach((v, k) => {
          hdrObj[k] = v;
        });
        captureSessionHeaders(url, hdrObj);
      }

      if (!activeSession) {
        return origFetch(input, init);
      }

      const method = (init?.method || (input instanceof Request ? input.method : 'GET')).toUpperCase();
      if (method !== 'POST' || !isDiscordMessagesEndpoint(url) || typeof init?.body !== 'string') {
        return origFetch(input, init);
      }

      let parsedBody: unknown;
      try {
        parsedBody = JSON.parse(init.body);
      } catch {
        return origFetch(input, init);
      }

      if (!isForwardRequestBody(parsedBody)) {
        return origFetch(input, init);
      }

      const session = activeSession;
      session.triggered = true;
      scheduleAutoDisarm(session);

      const firstTarget = session.messages[0];
      const remaining = session.messages.slice(1);
      const currentRef = parsedBody.message_reference as { message_id?: string };

      let nextInit = init;
      if (firstTarget && currentRef.message_id !== firstTarget.messageId) {
        const swapped = buildForwardPayload(parsedBody, firstTarget, { preserveContent: true });
        nextInit = { ...init, body: JSON.stringify(swapped) };
      }

      const capturedHeaders: Record<string, string> = {};
      if (init.headers) {
        new Headers(init.headers).forEach((v, k) => {
          capturedHeaders[k] = v;
        });
      }

      const response = await origFetch(input, nextInit);

      if (response.ok && remaining.length > 0) {
        void replayRemainingMessages(
          session.sessionId,
          url,
          capturedHeaders,
          parsedBody,
          remaining,
          session.messages.length,
        );
      } else {
        emitForwardProgress({
          sessionId: session.sessionId,
          sent: response.ok ? 1 : 0,
          total: session.messages.length,
          failed: response.ok ? 0 : session.messages.length,
          done: true,
        });
      }

      return response;
    }) as typeof window.fetch;
  },
});
