import { Prisma, type Job, type JobStatus, type WorkMode } from "@prisma/client";
import {
  compactText,
  normalizeTechnologies,
  slugify,
  type JobQuery,
  type RawJob,
  type UpdateJobInput
} from "@job-aggregator/shared";
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
  const prisma = getPrisma();
  const where: Prisma.JobWhereInput = {};

  if (query.q) {
    where.OR = [
      { title: { contains: query.q } },
      { company: { contains: query.q } },
      { location: { contains: query.q } },
      { source: { contains: query.q } },
      { salary: { contains: query.q } },
      { employmentType: { contains: query.q } },
      { description: { contains: query.q } }
    ];
  }

  if (query.source) where.source = query.source;
  if (query.workMode) where.workMode = query.workMode as WorkMode;
  if (query.status) where.status = query.status as JobStatus;
  if (typeof query.favorite === "boolean") where.favorite = query.favorite;
  if (query.technology) where.technologies = { array_contains: query.technology };
  if (query.postedFrom || query.postedTo) {
    where.postedAt = {
      ...(query.postedFrom ? { gte: new Date(`${query.postedFrom}T00:00:00.000Z`) } : {}),
      ...(query.postedTo ? { lte: new Date(`${query.postedTo}T23:59:59.999Z`) } : {})
    };
  }

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
  const prisma = getPrisma();
  const [total, saved, applied, favorites, bySource, byWorkMode, recent] = await prisma.$transaction([
    prisma.job.count(),
    prisma.job.count({ where: { status: "SAVED" } }),
    prisma.job.count({ where: { status: "APPLIED" } }),
    prisma.job.count({ where: { favorite: true } }),
    prisma.job.groupBy({
      by: ["source"],
      _count: { _all: true },
      orderBy: { source: "asc" }
    }),
    prisma.job.groupBy({
      by: ["workMode"],
      _count: { _all: true },
      orderBy: { workMode: "asc" }
    }),
    prisma.job.count({
      where: {
        firstSeenAt: {
          gte: new Date(Date.now() - 24 * 60 * 60 * 1000)
        }
      }
    })
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
