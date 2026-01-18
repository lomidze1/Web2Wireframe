export const normalizeSearchText = (value: string): string =>
  value.toLowerCase().replace(/\s+/g, " ").trim();

export const slugifyHeading = (value: string): string =>
  value
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/(^-|-$)/g, "") || "section";

export const buildHeadingIds = (headings: string[]): string[] => {
  const seen = new Set<string>();
  return headings.map((heading) => {
    const baseId = slugifyHeading(heading);
    let id = baseId;
    let counter = 1;
    while (seen.has(id)) {
      id = `${baseId}-${counter}`;
      counter += 1;
    }
    seen.add(id);
    return id;
  });
};

export const stripHeadingText = (value: string): string => {
  const withoutJsx = value
    .replace(/\{[^}]*\}/g, " ")
    .replace(/<[^>]+>/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'");
  return withoutJsx.replace(/\s+/g, " ").trim();
};
