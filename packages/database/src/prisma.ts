import { PrismaClient } from "@prisma/client";
import { loadEnvFromNearestFile } from "@job-aggregator/shared";

let prisma: PrismaClient | null = null;

export function getPrisma(): PrismaClient {
  loadEnvFromNearestFile();

  if (!prisma) {
    prisma = new PrismaClient({
      log:
        process.env.NODE_ENV === "development"
          ? ["query", "error", "warn"]
          : ["error", "warn"]
    });
  }

  return prisma;
}
