/**
 * Shared type guards for request-handler inputs and service-entry payloads.
 *
 * SECURITY: these exist to prevent NoSQL operator injection (`{$ne: null}`,
 * arrays from repeated query params, etc.) from reaching Mongoose filters.
 * Defense in depth — even after Zod / Express type checks upstream, every
 * service method that lands a value in a Mongo filter should call one of
 * these so future unchecked callers can't slip operators through.
 */

export function assertString(v: unknown, name: string): asserts v is string {
  if (typeof v !== "string" || v.length === 0) {
    throw new Error(`${name} must be a non-empty string`);
  }
}

export function assertStringMax(
  v: unknown,
  name: string,
  max: number,
): asserts v is string {
  assertString(v, name);
  if ((v as string).length > max) {
    throw new Error(`${name} exceeds max length ${max}`);
  }
}
