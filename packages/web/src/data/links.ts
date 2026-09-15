export type CheckoutLinks = {
  free: string;
  pro: string;
};

// Pricing CTA links — checkout itself happens IN the Figma plugin (the
// flow needs `figma.currentUser.id`, only available inside the plugin),
// so the marketing page directs users to the Figma Community plugin
// listing first. After install, the user upgrades from the plugin.
// Published Figma Community plugin listing — canonical "install / start free"
// destination (Pro upgrade happens in-plugin once installed).
export const FIGMA_PLUGIN_URL =
  "https://www.figma.com/community/plugin/1646327864971730293";

export const checkoutLinks: CheckoutLinks = {
  free: FIGMA_PLUGIN_URL,
  pro: FIGMA_PLUGIN_URL,
};

export type InstallLinks = {
  figma: string;
  chrome: string;
  figmaCommunity: string;
};

export const installLinks: InstallLinks = {
  figma: FIGMA_PLUGIN_URL,
  chrome:
    "https://chromewebstore.google.com/detail/web2wireframe/fcmicolldgpmpdkcdljkaaimmjmboipl",
  // "Start Free" CTAs point at the plugin listing (the free tier IS the plugin).
  figmaCommunity: FIGMA_PLUGIN_URL,
};
