// Published Figma Community plugin listing — canonical "install" destination.
export const FIGMA_PLUGIN_URL =
  "https://www.figma.com/community/plugin/1646327864971730293";

export type InstallLinks = {
  figma: string;
  chrome: string;
  figmaCommunity: string;
};

export const installLinks: InstallLinks = {
  figma: FIGMA_PLUGIN_URL,
  chrome:
    "https://chromewebstore.google.com/detail/web2wireframe/fcmicolldgpmpdkcdljkaaimmjmboipl",
  figmaCommunity: FIGMA_PLUGIN_URL,
};
