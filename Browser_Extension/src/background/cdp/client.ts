/**
 * CDP Client - Chrome DevTools Protocol wrapper
 * Uses chrome.debugger API to interact with CDP
 */

type CDPTarget = { tabId: number };

/**
 * CDP Client class for interacting with Chrome DevTools Protocol
 */
export class CDPClient {
  private target: CDPTarget;
  private attached = false;

  constructor(tabId: number) {
    this.target = { tabId };
  }

  /**
   * Attach debugger to the tab
   */
  async attach(): Promise<void> {
    if (this.attached) return;

    return new Promise((resolve, reject) => {
      chrome.debugger.attach(this.target, "1.3", () => {
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
   * Send CDP command
   */
  async send<T = unknown>(method: string, params?: object): Promise<T> {
    if (!this.attached) {
      throw new Error("CDP client not attached. Call attach() first.");
    }

    return new Promise((resolve, reject) => {
      chrome.debugger.sendCommand(this.target, method, params, (result) => {
        if (chrome.runtime.lastError) {
          reject(new Error(chrome.runtime.lastError.message));
        } else {
          resolve(result as T);
        }
      });
    });
  }

  /**
   * Enable CDP domain
   */
  async enableDomain(domain: string): Promise<void> {
    await this.send(`${domain}.enable`);
  }

  /**
   * Disable CDP domain
   */
  async disableDomain(domain: string): Promise<void> {
    await this.send(`${domain}.disable`);
  }

  /**
   * Check if attached
   */
  isAttached(): boolean {
    return this.attached;
  }
}

/**
 * Create and initialize a CDP client for a tab
 */
export async function createCDPClient(tabId: number): Promise<CDPClient> {
  const client = new CDPClient(tabId);
  await client.attach();

  // Enable required domains
  await Promise.all([
    client.enableDomain("DOM"),
    client.enableDomain("CSS"),
    client.enableDomain("Page"),
  ]);

  return client;
}
