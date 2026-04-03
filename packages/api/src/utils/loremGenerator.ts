// Lorem Ipsum generator with exact word count matching
const loremWords: readonly string[] = [
  "lorem",
  "ipsum",
  "dolor",
  "sit",
  "amet",
  "consectetur",
  "adipiscing",
  "elit",
  "sed",
  "do",
  "eiusmod",
  "tempor",
  "incididunt",
  "ut",
  "labore",
  "et",
  "dolore",
  "magna",
  "aliqua",
  "enim",
  "ad",
  "minim",
  "veniam",
  "quis",
  "nostrud",
  "exercitation",
  "ullamco",
  "laboris",
  "nisi",
  "aliquip",
  "ex",
  "ea",
  "commodo",
  "consequat",
  "duis",
  "aute",
  "irure",
  "in",
  "reprehenderit",
  "voluptate",
  "velit",
  "esse",
  "cillum",
  "fugiat",
  "nulla",
  "pariatur",
  "excepteur",
  "sint",
  "occaecat",
  "cupidatat",
  "non",
  "proident",
  "sunt",
  "culpa",
  "qui",
  "officia",
  "deserunt",
  "mollit",
  "anim",
  "id",
  "est",
  "laborum",
];

export function generateLoremIpsum(wordCount: number): string {
  if (wordCount <= 0) return "";

  const result: string[] = [];
  for (let i = 0; i < wordCount; i++) {
    result.push(loremWords[Math.floor(Math.random() * loremWords.length)]);
  }

  // Capitalize first word
  if (result.length > 0) {
    result[0] = result[0].charAt(0).toUpperCase() + result[0].slice(1);
  }

  return result.join(" ");
}

export function countWords(text: string | null | undefined): number {
  if (!text) return 0;
  return text
    .trim()
    .split(/\s+/)
    .filter((word) => word.length > 0).length;
}

export function cleanText(text: string | null | undefined): string {
  if (!text) return "";
  // Remove extra whitespace
  return text.trim().replace(/\s+/g, " ");
}
