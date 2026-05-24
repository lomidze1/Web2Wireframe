import type { SeoConfig } from "./types";
import { SITE_URL } from "./types";
import {
  organizationSchema,
  softwareApplicationSchema,
  productSchema,
  breadcrumbSchema,
  faqSchema,
} from "./schemas";

const SUPPORT_FAQ = [
  {
    question: "How many imports do I get on the Free plan?",
    answer:
      "Free users get 10 imports per month. The counter resets monthly.",
  },
  {
    question: "What's the difference between Pro Monthly and Pro Yearly?",
    answer:
      "Pro Monthly is $16 for 30 days of unlimited imports. Pro Yearly is $144 for 365 days — a 25% discount versus monthly. Both are one-time payments with no auto-renewal.",
  },
  {
    question: "Is my payment information secure?",
    answer:
      "Yes. Payments are processed by Flitt, a PCI-DSS Level 1 certified payment gateway. Your card details never touch our servers.",
  },
  {
    question: "Can I cancel my subscription?",
    answer:
      "Yes. You can stop renewing anytime. Your Pro access stays active until the end of the current period.",
  },
];

export const seoConfig: Record<string, SeoConfig> = {
  "/": {
    title:
      "Web2Wireframe — Convert Any Website Into Editable Figma Wireframes",
    description:
      "Turn any website into clean, editable Figma wireframes in minutes. Capture layouts, structure, fonts, and styles with our Figma plugin. Free tier available.",
    canonical: `${SITE_URL}/`,
    ogType: "website",
    twitterCard: "summary_large_image",
    jsonLd: [organizationSchema, softwareApplicationSchema],
  },
  "/how-it-works": {
    title: "How It Works — Web2Wireframe",
    description:
      "Learn how Web2Wireframe converts websites to Figma wireframes in 5 simple steps. Paste a URL, adjust settings, click import, and edit in Figma.",
    canonical: `${SITE_URL}/how-it-works`,
    ogType: "article",
    jsonLd: [
      breadcrumbSchema([
        { name: "Home", url: "/" },
        { name: "How It Works", url: "/how-it-works" },
      ]),
    ],
  },
  "/pricing": {
    title: "Pricing — Web2Wireframe Free & Pro Plans",
    description:
      "Free plan: 10 imports per month. Pro Monthly: $16 (30 days). Pro Yearly: $144 (365 days, save 25%). Unlimited imports, full colors, fonts, and styles.",
    canonical: `${SITE_URL}/pricing`,
    ogType: "product",
    jsonLd: [
      productSchema,
      breadcrumbSchema([
        { name: "Home", url: "/" },
        { name: "Pricing", url: "/pricing" },
      ]),
    ],
  },
  "/docs": {
    title: "Documentation — Web2Wireframe",
    description:
      "Get started with Web2Wireframe. Documentation for the Figma plugin, browser extension, import methods, and pricing.",
    canonical: `${SITE_URL}/docs`,
    ogType: "article",
    jsonLd: [
      breadcrumbSchema([
        { name: "Home", url: "/" },
        { name: "Docs", url: "/docs" },
      ]),
    ],
  },
  "/support": {
    title: "Support — Web2Wireframe",
    description:
      "Need help with Web2Wireframe? Contact our support team or browse the FAQ for answers to common questions about imports, billing, and Pro features.",
    canonical: `${SITE_URL}/support`,
    ogType: "article",
    jsonLd: [
      faqSchema(SUPPORT_FAQ),
      breadcrumbSchema([
        { name: "Home", url: "/" },
        { name: "Support", url: "/support" },
      ]),
    ],
  },
  "/terms": {
    title: "Terms & Conditions — Web2Wireframe",
    description:
      "Web2Wireframe terms of service. Read the legal terms for using our Figma plugin, browser extension, and website.",
    canonical: `${SITE_URL}/terms`,
    ogType: "article",
    jsonLd: [
      breadcrumbSchema([
        { name: "Home", url: "/" },
        { name: "Terms", url: "/terms" },
      ]),
    ],
  },
  "/privacy": {
    title: "Privacy Policy — Web2Wireframe",
    description:
      "How Web2Wireframe handles your data. Privacy policy for the Figma plugin, browser extension, and payment processing via Flitt.",
    canonical: `${SITE_URL}/privacy`,
    ogType: "article",
    jsonLd: [
      breadcrumbSchema([
        { name: "Home", url: "/" },
        { name: "Privacy", url: "/privacy" },
      ]),
    ],
  },
};

export function getSeoConfig(route: string): SeoConfig {
  return seoConfig[route] ?? seoConfig["/"];
}
