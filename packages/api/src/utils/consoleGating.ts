/**
 * Silence non-essential console output in production.
 *
 * `console.warn` and `console.error` stay live — they are the channels we
 * actually want to see in CloudWatch / Docker logs. `console.log`, `.info`,
 * `.debug`, and `.trace` are silenced because they're development-time
 * tracing that would otherwise pollute production logs and balloon log
 * storage costs.
 *
 * Set `DEBUG=1` to keep them on in production (useful for one-off
 * troubleshooting via temporary env override).
 *
 * Call this exactly once, at the very start of the API entry point.
 */
export function gateConsoleInProduction(): void {
  const isProduction = process.env.NODE_ENV === "production";
  const debugForced = process.env.DEBUG === "1";

  if (isProduction && !debugForced) {
    const noop = (): void => undefined;
    /* eslint-disable no-console -- the whole point of this helper is to
     * mutate console.{log,debug,info,trace} into no-ops. */
    console.log = noop;
    console.debug = noop;
    console.info = noop;
    console.trace = noop;
    /* eslint-enable no-console */
  }
}
