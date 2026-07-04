export async function sleep(ms: number): Promise<void> {
  await new Promise((resolve) => setTimeout(resolve, ms));
}

export async function retry<T>(
  operation: () => Promise<T>,
  options: { retries: number; delayMs: number; onRetry?: (error: unknown, attempt: number) => void }
): Promise<T> {
  let lastError: unknown;

  for (let attempt = 0; attempt <= options.retries; attempt += 1) {
    try {
      return await operation();
    } catch (error) {
      lastError = error;
      if (attempt === options.retries) break;
      options.onRetry?.(error, attempt + 1);
      await sleep(options.delayMs * (attempt + 1));
    }
  }

  throw lastError;
}

export function slugify(value: string): string {
  return value
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

export function compactText(value: string): string {
  return value.replace(/\s+/g, " ").trim();
}
