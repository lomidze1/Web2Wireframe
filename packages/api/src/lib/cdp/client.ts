/**
 * CDP Client for Puppeteer
 * Wraps page.target().createCDPSession() for direct CDP access
 *
 * Key difference from Browser Extension:
 * - Browser Extension uses chrome.debugger API
 * - Puppeteer uses CDPSession from page.target().createCDPSession()
 */

import type { CDPSession, Page } from "puppeteer";
import type { CDPClientInterface } from "@w2w/shared";

type CDPEventCallback = (params?: unknown) => void;

/**
 * Puppeteer CDP Client wrapper
 * Implements CDPClientInterface for shared-extraction compatibility
 */
export class CDPClient implements CDPClientInterface {
  session: CDPSession;
  enabledDomains: Set<string>;
  defaultTimeout: number;
  /** Tracked listeners for cleanup on detach */
  private _listeners: Map<string, Set<CDPEventCallback>>;

  constructor(session: CDPSession) {
    this.session = session;
    this.enabledDomains = new Set();
    this.defaultTimeout = 30000;
    this._listeners = new Map();
  }

  /**
   * Send CDP command
   */
  async send<T = unknown>(
    method: string,
    params: Record<string, unknown> = {},
    timeout?: number
  ): Promise<T> {
    const timeoutMs = timeout ?? this.defaultTimeout;

    return Promise.race([
      this.session.send(method as never, params as never) as Promise<T>,
      new Promise<T>((_, reject) => {
        setTimeout(() => {
          reject(new Error(`CDP ${method} timeout after ${timeoutMs}ms`));
        }, timeoutMs);
      }),
    ]);
  }

  /**
   * Enable a CDP domain
   */
  async enableDomain(domain: string): Promise<void> {
    if (this.enabledDomains.has(domain)) return;
    await this.send(`${domain}.enable`);
    this.enabledDomains.add(domain);
  }

  /**
   * Enable multiple CDP domains
   */
  async enableDomains(...domains: string[]): Promise<void> {
    await Promise.all(domains.map((d) => this.enableDomain(d)));
  }

  /**
   * Disable a CDP domain
   */
  async disableDomain(domain: string): Promise<void> {
    if (!this.enabledDomains.has(domain)) return;
    await this.send(`${domain}.disable`);
    this.enabledDomains.delete(domain);
  }

  /**
   * Listen for CDP events from the underlying session.
   * Implements StabilizationClient interface for shared-extraction compatibility.
   */
  on(event: string, callback: CDPEventCallback): () => void {
    this.session.on(event as never, callback as never);

    if (!this._listeners.has(event)) {
      this._listeners.set(event, new Set());
    }
    this._listeners.get(event)!.add(callback);

    let removed = false;
    return () => {
      if (removed) return;
      removed = true;
      this.session.off(event as never, callback as never);
      this._listeners.get(event)?.delete(callback);
    };
  }

  /**
   * Set default timeout for commands
   */
  setTimeout(ms: number): void {
    this.defaultTimeout = ms;
  }

  /**
   * Get list of enabled domains
   */
  getEnabledDomains(): string[] {
    return Array.from(this.enabledDomains);
  }

  /**
   * Detach the CDP session
   */
  async detach(): Promise<void> {
    // Remove all tracked event listeners before detaching
    for (const [event, callbacks] of this._listeners) {
      for (const cb of callbacks) {
        this.session.off(event as never, cb as never);
      }
    }
    this._listeners.clear();

    try {
      await this.session.detach();
    } catch {
      // Session might already be detached
    }
    this.enabledDomains.clear();
  }
}

export interface CreateCDPClientOptions {
  /** CDP domains to enable (default: DOM, CSS, DOMSnapshot, Runtime) */
  domains?: string[];
  /** Default timeout in ms (default: 30000) */
  timeout?: number;
}

/**
 * Create and initialize a CDP client from Puppeteer page
 */
export async function createCDPClient(
  page: Page,
  options: CreateCDPClientOptions = {}
): Promise<CDPClient> {
  const {
    domains = ["DOM", "CSS", "DOMSnapshot", "Runtime"],
    timeout = 30000,
  } = options;

  // Create CDP session from Puppeteer page
  const session = await page.target().createCDPSession();
  const client = new CDPClient(session);
  client.setTimeout(timeout);

  try {
    await client.enableDomains(...domains);
    return client;
  } catch (error) {
    await client.detach();
    throw error;
  }
}
