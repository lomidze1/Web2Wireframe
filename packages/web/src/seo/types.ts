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

/**
 * The host that actually serves the site. Vercel serves `www` and issues a
 * 308 from the bare domain, so canonicals, og:url, JSON-LD and the sitemap
 * all have to be `www` — pointing them at the bare domain would make every
 * one of them a redirect, and Google already has `www` in its index.
 */
export const SITE_URL = "https://www.web2wireframe.design";
export const SITE_NAME = "Web2Wireframe";
export const DEFAULT_OG_IMAGE = `${SITE_URL}/og-image.png`;
