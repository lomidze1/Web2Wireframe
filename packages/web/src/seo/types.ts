export interface JsonLd {
  "@context": "https://schema.org";
  "@type": string;
  [key: string]: unknown;
}

export interface SeoConfig {
  title: string;
  description: string;
  canonical: string;
  ogTitle?: string;
  ogDescription?: string;
  ogImage?: string;
  ogType?: "website" | "article" | "product";
  twitterCard?: "summary" | "summary_large_image";
  jsonLd?: JsonLd[];
  noindex?: boolean;
}

export const SITE_URL = "https://web2wireframe.design";
export const SITE_NAME = "Web2Wireframe";
export const DEFAULT_OG_IMAGE = `${SITE_URL}/og-image.png`;
