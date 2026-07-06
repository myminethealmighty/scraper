import { type NotificationChannel, type NotificationStatus, type SearchTermType } from "@prisma/client";
import { getPrisma } from "./prisma.js";

export type TelegramUserInput = {
  chatId: string | number;
  username?: string | null;
  firstName?: string | null;
  lastName?: string | null;
};

export type ProfileSourceInput = {
  sourceKey: string;
  sourceName: string;
  enabled?: boolean;
};

export type ProfileTermInput = {
  value: string;
  type?: SearchTermType;
};

export type GroupedScrapeTask = {
  sourceKey: string;
  sourceName: string;
  keyword: string;
  normalizedKeyword: string;
  profileIds: string[];
};

export type TelegramNotificationRecipient = {
  userId: string;
  chatId: string;
  profileIds: string[];
};

export function normalizeSearchTerm(value: string): string {
  const cleaned = value
    .toLowerCase()
    .replace(/\.js\b/g, " js")
    .replace(/[^a-z0-9+#]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();

  return normalizeKnownAlias(cleaned);
}

function normalizeKnownAlias(value: string): string {
  const aliases = new Map<string, string>([
    ["reactjs", "react"],
    ["react js", "react"],
    ["nextjs", "next js"],
    ["nodejs", "node js"],
    ["type script", "typescript"],
    ["java script", "javascript"],
    ["front end", "frontend"],
    ["back end", "backend"],
    ["fullstack", "full stack"]
  ]);

  return aliases.get(value) ?? value;
}

export async function upsertTelegramUser(input: TelegramUserInput) {
  const prisma = getPrisma();
  const chatId = String(input.chatId);

  return prisma.telegramUser.upsert({
    where: { chatId },
    create: {
      chatId,
      username: input.username ?? null,
      firstName: input.firstName ?? null,
      lastName: input.lastName ?? null
    },
    update: {
      username: input.username ?? null,
      firstName: input.firstName ?? null,
      lastName: input.lastName ?? null,
      isActive: true
    }
  });
}

export async function ensureSearchProfile(userId: string, name = "Default") {
  const prisma = getPrisma();
  const existing = await prisma.searchProfile.findFirst({
    where: { userId, name }
  });

  if (existing) return existing;

  return prisma.searchProfile.create({
    data: { userId, name }
  });
}

export async function setProfileSources(profileId: string, sources: ProfileSourceInput[]) {
  const prisma = getPrisma();
  const normalizedSources = sources
    .map((source) => ({
      sourceKey: source.sourceKey.trim(),
      sourceName: source.sourceName.trim(),
      enabled: source.enabled ?? true
    }))
    .filter((source) => source.sourceKey.length > 0 && source.sourceName.length > 0);

  await prisma.$transaction([
    prisma.searchSource.deleteMany({ where: { profileId } }),
    ...normalizedSources.map((source) =>
      prisma.searchSource.create({
        data: { profileId, ...source }
      })
    )
  ]);

  return prisma.searchSource.findMany({
    where: { profileId },
    orderBy: { sourceName: "asc" }
  });
}

export async function setProfileTerms(profileId: string, terms: ProfileTermInput[]) {
  const prisma = getPrisma();
  const normalizedTerms = terms
    .map((term) => ({
      value: term.value.trim(),
      normalizedValue: normalizeSearchTerm(term.value),
      type: term.type ?? "KEYWORD"
    }))
    .filter((term) => term.value.length > 0 && term.normalizedValue.length > 0);

  const uniqueTerms = Array.from(
    new Map(normalizedTerms.map((term) => [`${term.normalizedValue}:${term.type}`, term])).values()
  );

  await prisma.$transaction([
    prisma.searchTerm.deleteMany({ where: { profileId } }),
    ...uniqueTerms.map((term) =>
      prisma.searchTerm.create({
        data: { profileId, ...term }
      })
    )
  ]);

  return prisma.searchTerm.findMany({
    where: { profileId },
    orderBy: [{ type: "asc" }, { value: "asc" }]
  });
}

export async function listEnabledSearchProfiles() {
  return getPrisma().searchProfile.findMany({
    where: {
      enabled: true,
      user: { isActive: true }
    },
    include: {
      user: true,
      sources: { where: { enabled: true } },
      terms: true
    }
  });
}

export async function listGroupedScrapeTasks(): Promise<GroupedScrapeTask[]> {
  const profiles = await listEnabledSearchProfiles();
  const taskMap = new Map<string, GroupedScrapeTask>();

  for (const profile of profiles) {
    for (const source of profile.sources) {
      for (const term of profile.terms) {
        const key = `${source.sourceKey}:${term.normalizedValue}`;
        const existing = taskMap.get(key);

        if (existing) {
          existing.profileIds.push(profile.id);
          continue;
        }

        taskMap.set(key, {
          sourceKey: source.sourceKey,
          sourceName: source.sourceName,
          keyword: term.value,
          normalizedKeyword: term.normalizedValue,
          profileIds: [profile.id]
        });
      }
    }
  }

  return Array.from(taskMap.values());
}

export async function listTelegramNotificationRecipients(profileIds: string[]): Promise<TelegramNotificationRecipient[]> {
  if (profileIds.length === 0) return [];

  const profiles = await getPrisma().searchProfile.findMany({
    where: {
      id: { in: Array.from(new Set(profileIds)) },
      enabled: true,
      user: { isActive: true }
    },
    include: { user: true }
  });

  const recipients = new Map<string, TelegramNotificationRecipient>();
  for (const profile of profiles) {
    const existing = recipients.get(profile.userId);
    if (existing) {
      existing.profileIds.push(profile.id);
      continue;
    }

    recipients.set(profile.userId, {
      userId: profile.userId,
      chatId: profile.user.chatId,
      profileIds: [profile.id]
    });
  }

  return Array.from(recipients.values());
}

export async function recordNotificationLog(input: {
  userId: string;
  profileId?: string | null;
  jobId?: string | null;
  channel: NotificationChannel;
  recipient: string;
  status?: NotificationStatus;
  messageHash?: string | null;
  error?: string | null;
}) {
  return getPrisma().notificationLog.create({
    data: {
      userId: input.userId,
      profileId: input.profileId ?? null,
      jobId: input.jobId ?? null,
      channel: input.channel,
      recipient: input.recipient,
      status: input.status ?? "SENT",
      messageHash: input.messageHash ?? null,
      error: input.error ?? null
    }
  });
}
