import { Prisma, type Job, type JobStatus, type WorkMode } from "@prisma/client";
import {
  compactText,
  normalizeTechnologies,
  slugify,
  type JobQuery,
  type RawJob,
  type UpdateJobInput
} from "@job-scraper/shared";
import { getPrisma } from "./prisma.js";

export type JobRecord = Omit<Job, "technologies"> & {
  technologies: string[];
};

export type UpsertJobsResult = {
  created: Job[];
  updated: Job[];
};

export function createJobFingerprint(job: Pick<RawJob, "company" | "title" | "location">): string {
  return slugify(`${job.company}-${job.title}-${job.location}`);
}

export async function upsertJobs(rawJobs: RawJob[]): Promise<UpsertJobsResult> {
  const prisma = getPrisma();
  const created: Job[] = [];
  const updated: Job[] = [];

  for (const rawJob of rawJobs) {
    const fingerprint = createJobFingerprint(rawJob);
    const data = {
      title: compactText(rawJob.title),
      company: compactText(rawJob.company),
      location: compactText(rawJob.location || "Unknown"),
      salary: rawJob.salary ? compactText(rawJob.salary) : null,
      employmentType: rawJob.employmentType ? compactText(rawJob.employmentType) : null,
      workMode: rawJob.workMode as WorkMode,
      postedAt: rawJob.postedAt ?? null,
      description: rawJob.description ? compactText(rawJob.description) : null,
      technologies: normalizeTechnologies(rawJob.technologies),
      applyUrl: rawJob.applyUrl,
      source: rawJob.source,
      sourceJobId: rawJob.sourceJobId ?? null,
      fingerprint
    };

    const existing = await prisma.job.findFirst({
      where: {
        OR: [{ applyUrl: rawJob.applyUrl }, { fingerprint }]
      }
    });

    if (existing) {
      const job = await prisma.job.update({
        where: { id: existing.id },
        data
      });
      updated.push(job);
    } else {
      const job = await prisma.job.create({ data });
      created.push(job);
    }
  }

  return { created, updated };
}

export async function listJobs(query: JobQuery) {
  return listJobsWithWhere(query, buildJobQueryWhere(query));
}

export async function listJobsForTelegramUser(query: JobQuery, telegramId: string | null | undefined) {
  const where = await buildTelegramUserJobWhere(telegramId, query);
  return listJobsWithWhere(query, where);
}

export async function getJob(id: string) {
  const job = await getPrisma().job.findUnique({ where: { id } });
  return job ? toJobRecord(job) : null;
}

export async function updateJob(id: string, input: UpdateJobInput) {
  const job = await getPrisma().job.update({
    where: { id },
    data: input
  });

  return toJobRecord(job);
}

export async function getJobStats() {
  return getJobStatsWithWhere({});
}

export async function getJobStatsForTelegramUser(telegramId: string | null | undefined) {
  const where = await buildTelegramUserJobWhere(telegramId);
  return getJobStatsWithWhere(where);
}

async function listJobsWithWhere(query: JobQuery, where: Prisma.JobWhereInput) {
  const prisma = getPrisma();
  const skip = (query.page - 1) * query.pageSize;
  const [items, total] = await prisma.$transaction([
    prisma.job.findMany({
      where,
      orderBy: [{ firstSeenAt: "desc" }, { postedAt: "desc" }],
      skip,
      take: query.pageSize
    }),
    prisma.job.count({ where })
  ]);

  return {
    items: items.map(toJobRecord),
    total,
    page: query.page,
    pageSize: query.pageSize,
    pages: Math.ceil(total / query.pageSize)
  };
}

async function getJobStatsWithWhere(where: Prisma.JobWhereInput) {
  const prisma = getPrisma();
  const recentWhere: Prisma.JobWhereInput = {
    AND: [
      where,
      {
        firstSeenAt: {
          gte: new Date(Date.now() - 24 * 60 * 60 * 1000)
        }
      }
    ]
  };

  const [total, saved, applied, favorites, bySource, byWorkMode, recent] = await prisma.$transaction([
    prisma.job.count({ where }),
    prisma.job.count({ where: { AND: [where, { status: "SAVED" }] } }),
    prisma.job.count({ where: { AND: [where, { status: "APPLIED" }] } }),
    prisma.job.count({ where: { AND: [where, { favorite: true }] } }),
    prisma.job.groupBy({
      by: ["source"],
      where,
      _count: { _all: true },
      orderBy: { source: "asc" }
    }),
    prisma.job.groupBy({
      by: ["workMode"],
      where,
      _count: { _all: true },
      orderBy: { workMode: "asc" }
    }),
    prisma.job.count({ where: recentWhere })
  ]);

  return {
    total,
    saved,
    applied,
    favorites,
    recent,
    bySource: bySource
      .map((source) => ({ source: source.source, count: groupCount(source) }))
      .sort((a, b) => b.count - a.count),
    byWorkMode: byWorkMode.map((mode) => ({ workMode: mode.workMode, count: groupCount(mode) }))
  };
}

function buildJobQueryWhere(query: JobQuery): Prisma.JobWhereInput {
  const and: Prisma.JobWhereInput[] = [];

  if (query.q) and.push({ OR: buildTextSearchWhere(query.q) });
  if (query.source) and.push({ source: query.source });
  if (query.workMode) and.push({ workMode: query.workMode as WorkMode });
  if (query.status) and.push({ status: query.status as JobStatus });
  if (typeof query.favorite === "boolean") and.push({ favorite: query.favorite });
  if (query.technology) and.push({ technologies: { array_contains: query.technology } });
  if (query.postedFrom || query.postedTo) {
    and.push({
      postedAt: {
        ...(query.postedFrom ? { gte: new Date(query.postedFrom + "T00:00:00.000Z") } : {}),
        ...(query.postedTo ? { lte: new Date(query.postedTo + "T23:59:59.999Z") } : {})
      }
    });
  }

  return and.length > 0 ? { AND: and } : {};
}

async function buildTelegramUserJobWhere(telegramId: string | null | undefined, query?: JobQuery): Promise<Prisma.JobWhereInput> {
  const queryWhere = query ? buildJobQueryWhere(query) : {};
  if (!telegramId) return queryWhere;

  const profileWhere = await buildTelegramProfileWhere(telegramId);
  return { AND: [profileWhere, queryWhere] };
}

async function buildTelegramProfileWhere(telegramId: string): Promise<Prisma.JobWhereInput> {
  const user = await getPrisma().telegramUser.findUnique({
    where: { chatId: telegramId },
    include: {
      profiles: {
        where: { enabled: true },
        include: {
          sources: { where: { enabled: true } },
          terms: true
        }
      }
    }
  });

  if (!user) return impossibleWhere();

  const sources = new Set<string>();
  const terms = new Set<string>();

  for (const profile of user.profiles) {
    for (const source of profile.sources) sources.add(source.sourceName);
    for (const term of profile.terms) terms.add(term.value);
  }

  if (sources.size === 0 || terms.size === 0) return impossibleWhere();

  return {
    AND: [
      { source: { in: Array.from(sources) } },
      { OR: Array.from(terms).flatMap(buildTextSearchWhere) }
    ]
  };
}

function buildTextSearchWhere(value: string): Prisma.JobWhereInput[] {
  return [
    { title: { contains: value } },
    { company: { contains: value } },
    { location: { contains: value } },
    { source: { contains: value } },
    { salary: { contains: value } },
    { employmentType: { contains: value } },
    { description: { contains: value } }
  ];
}

function impossibleWhere(): Prisma.JobWhereInput {
  return { id: "__no_matching_profile__" };
}

function groupCount(value: { _count?: true | { _all?: number } }): number {
  if (value._count === true || !value._count) return 0;
  return value._count._all ?? 0;
}

function toJobRecord(job: Job): JobRecord {
  return {
    ...job,
    technologies: parseTechnologies(job.technologies)
  };
}

function parseTechnologies(value: Prisma.JsonValue): string[] {
  if (!Array.isArray(value)) return [];
  return value.filter((item): item is string => typeof item === "string");
}
