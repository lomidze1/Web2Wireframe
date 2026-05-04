export type CheckoutLinks = {
  free: string;
  pro: string;
};

// Pricing CTA links — checkout itself happens IN the Figma plugin (the
// flow needs `figma.currentUser.id`, only available inside the plugin),
// so the marketing page directs users to the Figma Community plugin
// listing first. After install, the user upgrades from the plugin.
export const checkoutLinks: CheckoutLinks = {
  free: "https://www.figma.com/community/plugin/web2wireframe", // Update once published
  pro: "https://www.figma.com/community/plugin/web2wireframe",  // Update once published
};

export type InstallLinks = {
  figma: string;
  chrome: string;
  figmaCommunity: string;
};

export const installLinks: InstallLinks = {
  figma: "#figma-plugin-coming-soon",
  chrome: "#chrome-extension-coming-soon",
  figmaCommunity: "https://www.figma.com/community/",
};
