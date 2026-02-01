/**
 * CDP Client - Production Ready Version
 * Uses chrome.debugger API to interact with Chrome DevTools Protocol
 */

export interface CDPClientConfig {
  tabId: number;
  domains?: string[];
  protocolVersion?: string;
  timeout?: number;
}

type CDPTarget = { tabId: number };
type CDPEventCallback = (params?: unknown) => void;

/**
 * Production-ready CDP Client with:
 * - Event listening
 * - Timeout handling
 * - Detach listener with cleanup
 * - Domain tracking
 */
export class CDPClient {
  private target: CDPTarget;
  private attached = false;
  private enabledDomains = new Set<string>();
  private eventListeners = new Map<string, Set<CDPEventCallback>>();
  private detachListenerCleanup?: () => void;
  private eventListenerCleanup?: () => void;
  private defaultTimeout = 30000;

  constructor(tabId: number) {
    this.target = { tabId };
    this.setupEventListening();
    this.setupDetachListener();
  }

  private setupEventListening(): void {
    const listener = (
      source: chrome.debugger.Debuggee,
      method: string,
      params?: object
    ) => {
      if (source.tabId === this.target.tabId) {
        this.handleEvent(method, params);
      }
    };

    chrome.debugger.onEvent.addListener(listener);
    this.eventListenerCleanup = () => {
      chrome.debugger.onEvent.removeListener(listener);
    };
  }

  private setupDetachListener(): void {
    const listener = (source: chrome.debugger.Debuggee, reason: string) => {
      if (source.tabId === this.target.tabId) {
        console.warn(`CDP detached: ${reason}`);
        this.attached = false;
        this.handleDetach();
      }
    };

    chrome.debugger.onDetach.addListener(listener);
    this.detachListenerCleanup = () => {
      chrome.debugger.onDetach.removeListener(listener);
    };
  }

  private handleEvent(method: string, params?: unknown): void {
    const listeners = this.eventListeners.get(method);
    if (listeners) {
      listeners.forEach((callback) => callback(params));
    }
  }

  private handleDetach(): void {
    this.removeAllListeners();
    this.enabledDomains.clear();
  }

  /**
   * Attach debugger to the tab
   */
  async attach(protocolVersion = "1.3"): Promise<void> {
    if (this.attached) return;

    return new Promise((resolve, reject) => {
      chrome.debugger.attach(this.target, protocolVersion, () => {
        if (chrome.runtime.lastError) {
          reject(new Error(chrome.runtime.lastError.message));
        } else {
          this.attached = true;
          resolve();
        }
      });
    });
  }

  /**
   * Detach debugger from the tab
   */
  async detach(): Promise<void> {
    if (!this.attached) return;

    return new Promise((resolve) => {
      chrome.debugger.detach(this.target, () => {
        this.attached = false;
        resolve();
      });
    });
  }

  /**
   * Send CDP command with timeout
   */
  async send<T = unknown>(
    method: string,
    params?: Record<string, unknown>,
    timeout?: number
  ): Promise<T> {
    if (!this.attached) {
      throw new Error("CDP client not attached. Call attach() first.");
    }

    const timeoutMs = timeout ?? this.defaultTimeout;

    return Promise.race([
      new Promise<T>((resolve, reject) => {
        chrome.debugger.sendCommand(
          this.target,
          method,
          params ?? {},
          (result) => {
            if (chrome.runtime.lastError) {
              reject(
                new Error(`CDP ${method}: ${chrome.runtime.lastError.message}`)
              );
            } else {
              resolve(result as T);
            }
          }
        );
      }),
      new Promise<never>((_, reject) => {
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
   * Listen for CDP events
   */
  on(event: string, callback: CDPEventCallback): () => void {
    if (!this.eventListeners.has(event)) {
      this.eventListeners.set(event, new Set());
    }
    this.eventListeners.get(event)!.add(callback);

    // Return cleanup function
    return () => {
      this.eventListeners.get(event)?.delete(callback);
    };
  }

  /**
   * Remove all event listeners
   */
  removeAllListeners(): void {
    this.eventListeners.clear();
  }

  /**
   * Set default timeout for commands
   */
  setTimeout(ms: number): void {
    this.defaultTimeout = ms;
  }

  /**
   * Check if attached
   */
  isAttached(): boolean {
    return this.attached;
  }

  /**
   * Get list of enabled domains
   */
  getEnabledDomains(): string[] {
    return Array.from(this.enabledDomains);
  }

  /**
   * Cleanup and destroy the client
   */
  async destroy(): Promise<void> {
    await this.detach();
    this.removeAllListeners();
    this.detachListenerCleanup?.();
    this.eventListenerCleanup?.();
  }
}

/**
 * Create and initialize a CDP client for a tab
 */
export async function createCDPClient(
  tabIdOrConfig: number | CDPClientConfig
): Promise<CDPClient> {
  const config: CDPClientConfig =
    typeof tabIdOrConfig === "number"
      ? { tabId: tabIdOrConfig }
      : tabIdOrConfig;

  const {
    tabId,
    domains = ["DOM", "CSS", "Page", "DOMSnapshot"],
    protocolVersion = "1.3",
    timeout = 30000,
  } = config;

  const client = new CDPClient(tabId);
  client.setTimeout(timeout);

  try {
    await client.attach(protocolVersion);
    await client.enableDomains(...domains);
    return client;
  } catch (error) {
    await client.destroy();
    throw error;
  }
}
