import { existsSync, readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";

let loaded = false;

export function loadEnvFromNearestFile(startDir = process.cwd()): void {
  if (loaded) return;
  loaded = true;

  const envPath = findUp(".env", startDir);
  if (!envPath) return;

  for (const line of readFileSync(envPath, "utf8").split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;

    const separator = trimmed.indexOf("=");
    if (separator === -1) continue;

    const key = trimmed.slice(0, separator).trim();
    const rawValue = trimmed.slice(separator + 1).trim();

    if (!key || process.env[key] !== undefined) continue;
    process.env[key] = unquote(rawValue);
  }
}

function findUp(fileName: string, startDir: string): string | null {
  let current = resolve(startDir);

  while (true) {
    const candidate = resolve(current, fileName);
    if (existsSync(candidate)) return candidate;

    const parent = dirname(current);
    if (parent === current) return null;
    current = parent;
  }
}

function unquote(value: string): string {
  if (
    (value.startsWith('"') && value.endsWith('"')) ||
    (value.startsWith("'") && value.endsWith("'"))
  ) {
    return value.slice(1, -1);
  }

  return value;
}
