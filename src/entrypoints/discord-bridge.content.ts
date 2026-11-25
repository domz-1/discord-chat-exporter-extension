import {
  buildForwardPayload,
  isDiscordMessagesEndpoint,
  isForwardRequestBody,
} from '../lib/forward';
import {
  EVENT_ARM_FORWARD,
  EVENT_DISARM_FORWARD,
  EVENT_FORWARD_PROGRESS,
  type ForwardProgressDetail,
  type ForwardSessionPayload,
  type ForwardTargetRef,
} from '../lib/types';

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

    const origXhrOpen = XMLHttpRequest.prototype.open;
    const origXhrSetHeader = XMLHttpRequest.prototype.setRequestHeader;
    const origXhrSend = XMLHttpRequest.prototype.send;
    const origFetch = window.fetch.bind(window);

    function emitProgress(detail: ForwardProgressDetail) {
      window.dispatchEvent(new CustomEvent(EVENT_FORWARD_PROGRESS, { detail }));
    }

    function sleep(ms: number): Promise<void> {
      return new Promise((resolve) => setTimeout(resolve, ms));
    }

    function sendXhrReplay(
      url: string,
      headers: Record<string, string>,
      bodyStr: string,
    ): Promise<{ status: number; responseText: string }> {
      return new Promise((resolve) => {
        const xhr = new XMLHttpRequest() as TrackedXhr;
        xhr.__dceInternal = true;
        origXhrOpen.call(xhr, 'POST', url, true);
        xhr.withCredentials = true;

        for (const [k, v] of Object.entries(headers)) {
          if (k.toLowerCase() === 'content-length') continue;
          try {
            origXhrSetHeader.call(xhr, k, v);
          } catch {
            // Skip forbidden browser-managed headers
          }
        }
        if (!Object.keys(headers).some((k) => k.toLowerCase() === 'content-type')) {
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

      emitProgress({ sessionId, sent, total: totalCount, done: false });

      for (const target of remaining) {
        await sleep(380);
        const payload = buildForwardPayload(baseBody, target, { preserveContent: false });
        const bodyStr = JSON.stringify(payload);

        let res = await sendXhrReplay(url, headers, bodyStr);

        // Respect Discord 429 rate-limit Retry-After once automatically
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
          res = await sendXhrReplay(url, headers, bodyStr);
        }

        if (res.status >= 200 && res.status < 300) {
          sent++;
        } else {
          failed++;
        }

        emitProgress({
          sessionId,
          sent,
          total: totalCount,
          failed,
          done: false,
        });
      }

      emitProgress({
        sessionId,
        sent,
        total: totalCount,
        failed,
        done: true,
      });
    }

    function scheduleAutoDisarm(session: ArmedSession) {
      if (session.disarmTimer) clearTimeout(session.disarmTimer);
      // Keep briefly armed after first destination fires so multi-destination
      // sends triggered by the same "Send" click also forward the full queue.
      session.disarmTimer = setTimeout(() => {
        if (activeSession?.sessionId === session.sessionId) {
          activeSession = null;
        }
      }, 2500);
    }

    // Listen for arm/disarm instructions from the isolated content script
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

      // Ensure message #1 in chronological order is the one sent first
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
              emitProgress({
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
            emitProgress({
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

    // --- Hook 2: window.fetch (fallback if Discord sends via fetch) ---
    window.fetch = (async (input: RequestInfo | URL, init?: RequestInit): Promise<Response> => {
      if (!activeSession) {
        return origFetch(input, init);
      }

      const url = typeof input === 'string' ? input : input instanceof URL ? input.href : input.url;
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
        const hdrs = new Headers(init.headers);
        hdrs.forEach((v, k) => {
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
        emitProgress({
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
