import { Prisma, type Job, type TelegramUser } from "@prisma/client";
import { compactText, extractTechnologies, normalizeTechnologies } from "@job-scraper/shared";
import { getPrisma } from "./prisma.js";

export type ParsedResumeProfile = {
  skills: string[];
  roles: string[];
  locations: string[];
  keywords: string[];
};

export type JobScoreResult = {
  jobId: string;
  score: number;
  matchedSkills: string[];
  matchedRoles: string[];
  matchedFields: string[];
};

const rolePatterns = [
  "frontend developer",
  "front end developer",
  "backend developer",
  "back end developer",
  "full stack developer",
  "software engineer",
  "software developer",
  "web developer",
  "mobile developer",
  "devops engineer",
  "data analyst",
  "product manager",
  "project manager",
  "qa engineer",
  "ui ux designer",
];

const locationPatterns = [
  "yangon",
  "mandalay",
  "naypyidaw",
  "myanmar",
  "bangkok",
  "thailand",
  "singapore",
  "remote",
  "hybrid",
];

export function parseResumeText(text: string): ParsedResumeProfile {
  const cleanText = compactText(text);
  const normalized = normalizeText(cleanText);
  const skills = normalizeTechnologies(extractTechnologies(cleanText));
  const roles = rolePatterns
    .filter((role) => normalized.includes(role))
    .map(titleCase);
  const locations = locationPatterns
    .filter((location) => normalized.includes(location))
    .map(titleCase);
  const keywords = Array.from(new Set([...skills, ...roles, ...locations])).slice(0, 60);

  return { skills, roles, locations, keywords };
}

export async function upsertResumeProfileForTelegramChat(
  telegramChatId: string,
  resumeText: string,
) {
  const prisma = getPrisma();
  const user = await prisma.telegramUser.findUnique({ where: { chatId: telegramChatId } });
  if (!user) throw new Error("Telegram user not found for resume profile");

  const parsed = parseResumeText(resumeText);
  const profile = await prisma.resumeProfile.upsert({
    where: { userId: user.id },
    create: {
      userId: user.id,
      skills: parsed.skills,
      roles: parsed.roles,
      locations: parsed.locations,
      keywords: parsed.keywords,
    },
    update: {
      skills: parsed.skills,
      roles: parsed.roles,
      locations: parsed.locations,
      keywords: parsed.keywords,
    },
  });

  return { profile, parsed, user };
}

export async function getResumeProfileForTelegramChat(telegramChatId: string) {
  const user = await getPrisma().telegramUser.findUnique({
    where: { chatId: telegramChatId },
    include: { resumeProfile: true },
  });

  return user?.resumeProfile ?? null;
}

export async function scoreJobsForTelegramChat(telegramChatId: string, limit = 500) {
  const prisma = getPrisma();
  const user = await prisma.telegramUser.findUnique({
    where: { chatId: telegramChatId },
    include: { resumeProfile: true },
  });

  if (!user?.resumeProfile) return [];

  const jobs = await prisma.job.findMany({
    orderBy: [{ postedAt: "desc" }, { firstSeenAt: "desc" }],
    take: limit,
  });
  const parsed = {
    skills: parseJsonStrings(user.resumeProfile.skills),
    roles: parseJsonStrings(user.resumeProfile.roles),
    locations: parseJsonStrings(user.resumeProfile.locations),
  };
  const scores = jobs.map((job) => scoreJob(job, parsed));

  await prisma.$transaction(
    scores.map((score) =>
      prisma.jobScore.upsert({
        where: { userId_jobId: { userId: user.id, jobId: score.jobId } },
        create: {
          userId: user.id,
          jobId: score.jobId,
          score: score.score,
          matchedSkills: score.matchedSkills,
          matchedRoles: score.matchedRoles,
          matchedFields: score.matchedFields,
        },
        update: {
          score: score.score,
          matchedSkills: score.matchedSkills,
          matchedRoles: score.matchedRoles,
          matchedFields: score.matchedFields,
        },
      }),
    ),
  );

  return scores;
}

export async function listJobScoresForTelegramChat(telegramChatId: string, jobIds: string[]) {
  if (jobIds.length === 0) return new Map<string, JobScoreResult>();

  const user = await getPrisma().telegramUser.findUnique({ where: { chatId: telegramChatId } });
  if (!user) return new Map<string, JobScoreResult>();

  const scores = await getPrisma().jobScore.findMany({
    where: { userId: user.id, jobId: { in: jobIds } },
  });

  return new Map(
    scores.map((score) => [
      score.jobId,
      {
        jobId: score.jobId,
        score: score.score,
        matchedSkills: parseJsonStrings(score.matchedSkills),
        matchedRoles: parseJsonStrings(score.matchedRoles),
        matchedFields: parseJsonStrings(score.matchedFields),
      },
    ]),
  );
}

export async function scoreAllResumeProfiles(limit = 500) {
  const users = await getPrisma().telegramUser.findMany({
    where: { resumeProfile: { isNot: null } },
    select: { chatId: true },
  });
  const results = [];

  for (const user of users) {
    results.push({
      chatId: user.chatId,
      scores: await scoreJobsForTelegramChat(user.chatId, limit),
    });
  }

  return results;
}

function scoreJob(
  job: Pick<Job, "id" | "title" | "company" | "location" | "description" | "technologies" | "source">,
  resume: Pick<ParsedResumeProfile, "skills" | "roles" | "locations">,
): JobScoreResult {
  const jobText = normalizeText([
    job.title,
    job.company,
    job.location,
    job.description ?? "",
    job.source,
    ...parseJsonStrings(job.technologies),
  ].join(" "));
  const jobTechnologies = normalizeTechnologies(parseJsonStrings(job.technologies));
  const matchedSkills = resume.skills.filter((skill) => includesTerm(jobText, skill) || jobTechnologies.includes(skill));
  const matchedRoles = resume.roles.filter((role) => includesTerm(jobText, role));
  const matchedLocations = resume.locations.filter((location) => includesTerm(jobText, location));
  const score = Math.min(
    100,
    matchedSkills.length * 14 + matchedRoles.length * 18 + matchedLocations.length * 8,
  );

  return {
    jobId: job.id,
    score,
    matchedSkills,
    matchedRoles,
    matchedFields: matchedLocations.length > 0 ? ["location"] : [],
  };
}

function parseJsonStrings(value: Prisma.JsonValue): string[] {
  if (!Array.isArray(value)) return [];
  return value.filter((item): item is string => typeof item === "string");
}

function includesTerm(haystack: string, term: string): boolean {
  const normalized = normalizeText(term);
  if (!normalized) return false;
  return haystack.includes(normalized);
}

function normalizeText(value: string): string {
  return value
    .toLowerCase()
    .replace(/\.js\b/g, " js")
    .replace(/[^a-z0-9+#]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function titleCase(value: string): string {
  return value.replace(/\b\w/g, (match) => match.toUpperCase());
}
