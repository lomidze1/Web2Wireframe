import { FIGMA_PLUGIN_URL } from "../../data/links";

/**
 * `/go/<source>` links count a click per channel (the path itself is what
 * Vercel Web Analytics records) and then send the visitor to the plugin
 * listing. The delay gives the analytics pageview time to leave the page
 * before we navigate away.
 */
export const REDIRECT_DELAY_MS = 800;

const MAX_SOURCE_LENGTH = 30;

export type GoRedirect = {
  source: string;
  target: string;
};

export function resolveGoRedirect(source?: string): GoRedirect {
  const slug = (source ?? "").toLowerCase().replace(/[^a-z0-9-]/g, "");
  const valid = slug.length > 0 && slug.length <= MAX_SOURCE_LENGTH;
  return { source: valid ? slug : "other", target: FIGMA_PLUGIN_URL };
}
