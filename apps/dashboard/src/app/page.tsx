import { BriefcaseBusiness, ExternalLink, Filter, Heart, Search, Star } from "lucide-react";
import { getJobStats, listJobs } from "@job-aggregator/database";
import { jobQuerySchema } from "@job-aggregator/shared";
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
          <h1>Job Aggregator</h1>
          <p>React, Next.js, Laravel, PHP, TypeScript, Node.js, and Full Stack roles.</p>
        </div>
        <a className="button primary" href="/api/jobs" title="Open REST API jobs endpoint">
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
        <input className="input" name="q" defaultValue={query.q} placeholder="Search jobs, companies, descriptions" />
        <select className="select" name="workMode" defaultValue={query.workMode ?? ""}>
          <option value="">Any mode</option>
          <option value="REMOTE">Remote</option>
          <option value="HYBRID">Hybrid</option>
          <option value="ONSITE">Onsite</option>
          <option value="UNKNOWN">Unknown</option>
        </select>
        <select className="select" name="status" defaultValue={query.status ?? ""}>
          <option value="">Any status</option>
          <option value="NEW">New</option>
          <option value="SAVED">Saved</option>
          <option value="APPLIED">Applied</option>
          <option value="ARCHIVED">Archived</option>
        </select>
        <input className="input" name="technology" defaultValue={query.technology} placeholder="Technology" />
        <select className="select" name="favorite" defaultValue={String(query.favorite ?? "")}>
          <option value="">All jobs</option>
          <option value="true">Favorites</option>
          <option value="false">Not favorites</option>
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
                  <h2>{job.title}</h2>
                  <div className="meta">
                    <span>{job.company}</span>
                    <span>{job.location}</span>
                    <span>{job.source}</span>
                    <span>{job.workMode}</span>
                    {job.salary ? <span>{job.salary}</span> : null}
                  </div>
                  <div className="badge-row">
                    <span className="badge">{job.status}</span>
                    {job.employmentType ? <span className="badge">{job.employmentType}</span> : null}
                    {job.technologies.slice(0, 8).map((technology) => (
                      <span className="badge" key={technology}>
                        {technology}
                      </span>
                    ))}
                  </div>
                  {job.description ? <p>{truncate(job.description, 260)}</p> : null}
                </div>
                <div className="actions">
                  <form action={updateJobAction.bind(null, job.id)}>
                    <input type="hidden" name="favorite" value={String(!job.favorite)} />
                    <button className={`icon-button ${job.favorite ? "active" : ""}`} type="submit" title="Toggle favorite">
                      <Heart size={17} fill={job.favorite ? "currentColor" : "none"} />
                    </button>
                  </form>
                  <form action={updateJobAction.bind(null, job.id)}>
                    <input type="hidden" name="status" value={job.status === "SAVED" ? "NEW" : "SAVED"} />
                    <button className={`icon-button ${job.status === "SAVED" ? "active" : ""}`} type="submit" title="Toggle saved">
                      <Star size={17} fill={job.status === "SAVED" ? "currentColor" : "none"} />
                    </button>
                  </form>
                  <form action={updateJobAction.bind(null, job.id)}>
                    <input type="hidden" name="status" value="APPLIED" />
                    <button className="button" type="submit">Applied</button>
                  </form>
                  <a className="icon-button button" href={job.applyUrl} target="_blank" rel="noreferrer" title="Open apply URL">
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
            <span>{jobs.pageSize} per page</span>
          </div>
        </section>

        <aside className="side-panel">
          <h2>Sources</h2>
          {stats.bySource.length === 0 ? (
            <p>No scrape data yet.</p>
          ) : (
            stats.bySource.map((source) => (
              <div className="source-row" key={source.source}>
                <span>{source.source}</span>
                <strong>{source.count}</strong>
              </div>
            ))
          )}

          <h2 style={{ marginTop: 24 }}>Work Modes</h2>
          {stats.byWorkMode.map((mode) => (
            <div className="source-row" key={mode.workMode}>
              <span>{mode.workMode}</span>
              <strong>{mode.count}</strong>
            </div>
          ))}
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

function flattenSearchParams(params: Record<string, string | string[] | undefined>) {
  return Object.fromEntries(
    Object.entries(params).map(([key, value]) => [key, Array.isArray(value) ? value[0] : value])
  );
}

function truncate(value: string, max: number) {
  return value.length > max ? `${value.slice(0, max - 1)}...` : value;
}
