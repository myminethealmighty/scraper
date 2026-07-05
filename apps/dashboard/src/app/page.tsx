import {
  BriefcaseBusiness,
  ExternalLink,
  Filter,
  Heart,
  CalendarDays,
  Search,
  Star,
} from "lucide-react";
import { getJobStats, listJobs } from "@job-scraper/database";
import { jobQuerySchema, type JobQuery } from "@job-scraper/shared";
import { updateJobAction } from "./actions";

type PageProps = {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
};

export default async function DashboardPage({ searchParams }: PageProps) {
  const params = await searchParams;
  const query = jobQuerySchema.parse(flattenSearchParams(params));
  const [jobs, stats] = await Promise.all([listJobs(query), getJobStats()]);

  return (
    <main className="shell">
      <header className="topbar">
        <div className="brand">
          <h1>Job Scraper</h1>
        </div>
        <a
          className="button primary"
          href="/api/jobs"
          title="Open REST API jobs endpoint"
        >
          <BriefcaseBusiness size={18} />
          API
        </a>
      </header>

      <section className="stats" aria-label="Job statistics">
        <Stat label="Total jobs" value={stats.total} />
        <Stat label="New in 24h" value={stats.recent} />
        <Stat label="Saved" value={stats.saved} />
        <Stat label="Applied" value={stats.applied} />
        <Stat label="Favorites" value={stats.favorites} />
      </section>

      <form className="filters">
        <input
          className="input"
          name="q"
          defaultValue={query.q}
          placeholder="Search title, company, source, salary, description"
        />
        <select
          className="select"
          name="source"
          defaultValue={query.source ?? ""}
        >
          <option value="">Any source</option>
          {stats.bySource.map((source) => (
            <option value={source.source} key={source.source}>
              {source.source}
            </option>
          ))}
        </select>
        <select
          className="select"
          name="workMode"
          defaultValue={query.workMode ?? ""}
        >
          <option value="">Any mode</option>
          <option value="REMOTE">Remote</option>
          <option value="HYBRID">Hybrid</option>
          <option value="ONSITE">Onsite</option>
          <option value="UNKNOWN">Unknown</option>
        </select>
        <select
          className="select"
          name="status"
          defaultValue={query.status ?? ""}
        >
          <option value="">Any status</option>
          <option value="NEW">New</option>
          <option value="SAVED">Saved</option>
          <option value="APPLIED">Applied</option>
          <option value="ARCHIVED">Archived</option>
        </select>
        <input
          className="input"
          name="technology"
          defaultValue={query.technology}
          placeholder="Technology"
        />
        <select
          className="select"
          name="favorite"
          defaultValue={String(query.favorite ?? "")}
        >
          <option value="">All jobs</option>
          <option value="true">Favorites</option>
          <option value="false">Not favorites</option>
        </select>
        <input
          className="input"
          name="postedFrom"
          type="date"
          defaultValue={query.postedFrom}
          title="Posted from"
        />
        <input
          className="input"
          name="postedTo"
          type="date"
          defaultValue={query.postedTo}
          title="Posted to"
        />
        <select
          className="select"
          name="pageSize"
          defaultValue={String(query.pageSize)}
        >
          <option value="10">10</option>
          <option value="25">25</option>
          <option value="50">50</option>
          <option value="100">100</option>
        </select>
        <button className="button primary" type="submit">
          <Search size={17} />
          Search
        </button>
      </form>

      <div className="layout">
        <section className="job-list" aria-label="Jobs">
          {jobs.items.length === 0 ? (
            <div className="empty">
              <Filter size={24} />
              <p>No jobs match these filters yet.</p>
            </div>
          ) : (
            jobs.items.map((job) => (
              <article className="job-card" key={job.id}>
                <div>
                  <h2>
                    {cleanDisplayText(job.title)}{" "}
                    <span className="source-badge">{job.source}</span>
                  </h2>
                  <div className="job-lines">
                    <div>{job.company}</div>
                    <div>{job.location}</div>
                    <div className="detail-row">
                      <span>{job.workMode}</span>
                      {job.salary ? <span>{job.salary}</span> : null}
                      {job.postedAt ? (
                        <span className="posted-date">
                          <CalendarDays size={14} /> {formatDate(job.postedAt)}
                        </span>
                      ) : null}
                      {job.employmentType ? (
                        <span>{job.employmentType}</span>
                      ) : null}
                    </div>
                  </div>
                  <div className="badge-row">
                    {job.technologies.length === 0 ? (
                      <span className="badge muted">Tech stack not listed</span>
                    ) : null}
                    {job.technologies.slice(0, 10).map((technology) => (
                      <a
                        className="badge"
                        href={buildHref(query, { technology, page: undefined })}
                        key={technology}
                      >
                        {technology}
                      </a>
                    ))}
                  </div>
                  {cleanDisplayText(job.description) ? (
                    <p>{truncate(cleanDisplayText(job.description), 260)}</p>
                  ) : null}
                </div>
                <div className="actions">
                  <form action={updateJobAction.bind(null, job.id)}>
                    <input
                      type="hidden"
                      name="favorite"
                      value={String(!job.favorite)}
                    />
                    <button
                      className={["icon-button", job.favorite ? "active" : ""]
                        .filter(Boolean)
                        .join(" ")}
                      type="submit"
                      title="Toggle favorite"
                    >
                      <Heart
                        size={17}
                        fill={job.favorite ? "currentColor" : "none"}
                      />
                    </button>
                  </form>
                  <form action={updateJobAction.bind(null, job.id)}>
                    <input
                      type="hidden"
                      name="status"
                      value={job.status === "SAVED" ? "NEW" : "SAVED"}
                    />
                    <button
                      className={[
                        "icon-button",
                        job.status === "SAVED" ? "active" : "",
                      ]
                        .filter(Boolean)
                        .join(" ")}
                      type="submit"
                      title="Toggle saved"
                    >
                      <Star
                        size={17}
                        fill={job.status === "SAVED" ? "currentColor" : "none"}
                      />
                    </button>
                  </form>
                  <form action={updateJobAction.bind(null, job.id)}>
                    <input type="hidden" name="status" value="APPLIED" />
                    <button className="button" type="submit">
                      Applied
                    </button>
                  </form>
                  <a
                    className="icon-button button"
                    href={job.applyUrl}
                    target="_blank"
                    rel="noreferrer"
                    title="Open apply URL"
                  >
                    <ExternalLink size={17} />
                  </a>
                </div>
              </article>
            ))
          )}
          <div className="pager">
            <span>
              Page {jobs.page} of {Math.max(jobs.pages, 1)} - {jobs.total} jobs
            </span>
            <div className="pager-actions">
              <a
                className={["button", jobs.page <= 1 ? "disabled" : ""]
                  .filter(Boolean)
                  .join(" ")}
                href={buildHref(query, { page: Math.max(1, jobs.page - 1) })}
              >
                Previous
              </a>
              <a
                className={["button", jobs.page >= jobs.pages ? "disabled" : ""]
                  .filter(Boolean)
                  .join(" ")}
                href={buildHref(query, {
                  page: Math.min(Math.max(jobs.pages, 1), jobs.page + 1),
                })}
              >
                Next
              </a>
            </div>
          </div>
        </section>

        <aside className="side-panel">
          <h2>Sources</h2>
          {stats.bySource.length === 0 ? (
            <p>No scrape data yet.</p>
          ) : (
            stats.bySource.map((source) => (
              <a
                className={[
                  "source-row",
                  query.source === source.source ? "active" : "",
                ]
                  .filter(Boolean)
                  .join(" ")}
                href={buildHref(query, {
                  source: source.source,
                  page: undefined,
                })}
                key={source.source}
              >
                <span>{source.source}</span>
                <strong>{source.count}</strong>
              </a>
            ))
          )}

          <h2 style={{ marginTop: 24 }}>Work Modes</h2>
          {stats.byWorkMode.map((mode) => (
            <a
              className={[
                "source-row",
                query.workMode === mode.workMode ? "active" : "",
              ]
                .filter(Boolean)
                .join(" ")}
              href={buildHref(query, {
                workMode: mode.workMode,
                page: undefined,
              })}
              key={mode.workMode}
            >
              <span>{mode.workMode}</span>
              <strong>{mode.count}</strong>
            </a>
          ))}

          {query.source ||
          query.workMode ||
          query.status ||
          query.technology ||
          query.favorite !== undefined ||
          query.postedFrom ||
          query.postedTo ||
          query.q ? (
            <a className="button clear-button" href="/">
              Clear filters
            </a>
          ) : null}
        </aside>
      </div>
    </main>
  );
}

function Stat({ label, value }: { label: string; value: number }) {
  return (
    <div className="stat">
      <span>{label}</span>
      <strong>{value}</strong>
    </div>
  );
}

function flattenSearchParams(
  params: Record<string, string | string[] | undefined>,
) {
  return Object.fromEntries(
    Object.entries(params)
      .map(([key, value]) => [key, Array.isArray(value) ? value[0] : value])
      .filter(([, value]) => value !== undefined && value !== ""),
  );
}

function buildHref(
  query: JobQuery,
  overrides: Partial<
    Record<keyof JobQuery, string | number | boolean | undefined>
  >,
) {
  const params = new URLSearchParams();
  const next = { ...query, ...overrides };

  for (const [key, value] of Object.entries(next)) {
    if (value === undefined || value === "" || value === null) continue;
    if (key === "page" && Number(value) === 1) continue;
    params.set(key, String(value));
  }

  const search = params.toString();
  return search ? "/?" + search : "/";
}

function formatDate(value: Date | string) {
  return new Intl.DateTimeFormat("en-GB", {
    day: "numeric",
    month: "short",
    year: "numeric",
  }).format(new Date(value));
}

function cleanDisplayText(value: string | null) {
  return (value ?? "")
    .replace(/\b\S*_with_bool_\S*\b/g, " ")
    .replace(/^\(\(env,\s*targets\).*$/s, "")
    .replace(/\s+/g, " ")
    .trim();
}

function truncate(value: string, max: number) {
  return value.length > max ? value.slice(0, max - 1) + "..." : value;
}
