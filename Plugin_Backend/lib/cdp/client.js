/**
 * CDP Client for Puppeteer
 * Wraps page.target().createCDPSession() for direct CDP access
 *
 * Key difference from Browser Extension:
 * - Browser Extension uses chrome.debugger API
 * - Puppeteer uses CDPSession from page.target().createCDPSession()
 */

/**
 * @typedef {import('puppeteer').CDPSession} CDPSession
 * @typedef {import('puppeteer').Page} Page
 */

/**
 * Puppeteer CDP Client wrapper
 * Provides consistent API for CDP operations
 */
class CDPClient {
  /**
   * @param {CDPSession} session - Puppeteer CDP session
   */
  constructor(session) {
    /** @type {CDPSession} */
    this.session = session;
    /** @type {Set<string>} */
    this.enabledDomains = new Set();
    /** @type {number} */
    this.defaultTimeout = 30000;
  }

  /**
   * Send CDP command
   * @template T
   * @param {string} method - CDP method name (e.g., "DOM.getDocument")
   * @param {Record<string, unknown>} [params] - Method parameters
   * @param {number} [timeout] - Optional timeout override
   * @returns {Promise<T>}
   */
  async send(method, params = {}, timeout) {
    const timeoutMs = timeout ?? this.defaultTimeout;

    return Promise.race([
      this.session.send(method, params),
      new Promise((_, reject) => {
        setTimeout(() => {
          reject(new Error(`CDP ${method} timeout after ${timeoutMs}ms`));
        }, timeoutMs);
      }),
    ]);
  }

  /**
   * Enable a CDP domain
   * @param {string} domain - Domain name (e.g., "DOM", "CSS")
   */
  async enableDomain(domain) {
    if (this.enabledDomains.has(domain)) return;
    await this.send(`${domain}.enable`);
    this.enabledDomains.add(domain);
  }

  /**
   * Enable multiple CDP domains
   * @param {...string} domains
   */
  async enableDomains(...domains) {
    await Promise.all(domains.map((d) => this.enableDomain(d)));
  }

  /**
   * Disable a CDP domain
   * @param {string} domain
   */
  async disableDomain(domain) {
    if (!this.enabledDomains.has(domain)) return;
    await this.send(`${domain}.disable`);
    this.enabledDomains.delete(domain);
  }

  /**
   * Set default timeout for commands
   * @param {number} ms
   */
  setTimeout(ms) {
    this.defaultTimeout = ms;
  }

  /**
   * Get list of enabled domains
   * @returns {string[]}
   */
  getEnabledDomains() {
    return Array.from(this.enabledDomains);
  }

  /**
   * Detach the CDP session
   */
  async detach() {
    try {
      await this.session.detach();
    } catch (e) {
      // Session might already be detached
    }
    this.enabledDomains.clear();
  }
}

/**
 * Create and initialize a CDP client from Puppeteer page
 * @param {Page} page - Puppeteer page object
 * @param {Object} [options]
 * @param {string[]} [options.domains] - CDP domains to enable
 * @param {number} [options.timeout] - Default timeout
 * @returns {Promise<CDPClient>}
 */
async function createCDPClient(page, options = {}) {
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

module.exports = { CDPClient, createCDPClient };
