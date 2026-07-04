const aliases = new Map<string, string>([
  ["reactjs", "React"],
  ["react.js", "React"],
  ["react", "React"],
  ["nextjs", "Next.js"],
  ["next.js", "Next.js"],
  ["next", "Next.js"],
  ["nodejs", "Node.js"],
  ["node.js", "Node.js"],
  ["node", "Node.js"],
  ["typescript", "TypeScript"],
  ["ts", "TypeScript"],
  ["javascript", "JavaScript"],
  ["js", "JavaScript"],
  ["php", "PHP"],
  ["laravel", "Laravel"],
  ["fullstack", "Full Stack"],
  ["full stack", "Full Stack"],
  ["mysql", "MySQL"],
  ["postgres", "PostgreSQL"],
  ["postgresql", "PostgreSQL"],
  ["prisma", "Prisma"]
]);

const knownTechnologies = [
  "React",
  "ReactJS",
  "Next.js",
  "NextJS",
  "Laravel",
  "PHP",
  "TypeScript",
  "JavaScript",
  "Node.js",
  "NodeJS",
  "Full Stack",
  "MySQL",
  "PostgreSQL",
  "Prisma",
  "Docker",
  "AWS",
  "GraphQL",
  "REST"
];

export function normalizeTechnology(value: string): string {
  const key = value.trim().toLowerCase();
  return aliases.get(key) ?? value.trim();
}

export function normalizeTechnologies(values: string[]): string[] {
  return Array.from(
    new Set(values.map(normalizeTechnology).filter((value) => value.length > 0))
  ).sort((a, b) => a.localeCompare(b));
}

export function extractTechnologies(text: string): string[] {
  const normalizedText = text.toLowerCase();
  const matches = knownTechnologies.filter((technology) =>
    normalizedText.includes(technology.toLowerCase())
  );

  return normalizeTechnologies(matches);
}
