"use client";

import { useMemo, useState, useTransition, type FormEvent } from "react";
import {
  ArrowDownWideNarrow,
  ArrowUpWideNarrow,
  CalendarDays,
  ExternalLink,
  Filter,
  Heart,
  LogOut,
  FileText,
  RotateCcw,
  Search,
  X,
} from "lucide-react";

import type { JobQuery } from "@job-scraper/shared";
import { updateJobAction } from "../actions";

type DashboardJob = {
  id: string;
  title: string;
  company: string;
  location: string;
  salary: string | null;
  employmentType: string | null;
  workMode: string;
  postedAt: Date | string | null;
  firstSeenAt: Date | string;
  description: string | null;
  technologies: string[];
  applyUrl: string;
  source: string;
  status: string;
  favorite: boolean;
  matchScore?: number | null;
  matchedSkills?: string[];
  matchedRoles?: string[];
};

type JobsResult = {
  items: DashboardJob[];
  total: number;
  page: number;
  pageSize: number;
  pages: number;
};

type DashboardStats = {
  total: number;
  recent: number;
  saved: number;
  applied: number;
  favorites: number;
  bySource: Array<{ source: string; count: number }>;
  byWorkMode: Array<{ workMode: string; count: number }>;
};

type DashboardClientProps = {
  initialJobs: JobsResult;
  initialResume: ResumeSummary | null;
  stats: DashboardStats;
  username?: string | null;
};

type ResumeSummary = {
  skills: string[];
  roles: string[];
  locations: string[];
  updatedAt: Date | string;
};

type QueryState = Pick<
  JobQuery,
  "q" | "source" | "workMode" | "status" | "favorite" | "page" | "pageSize"
> & {
  resumeMatched?: boolean;
  matchScoreSort?: "asc" | "desc";
};

const defaultQuery: QueryState = {
  q: undefined,
  source: undefined,
  workMode: undefined,
  status: undefined,
  favorite: undefined,
  resumeMatched: undefined,
  matchScoreSort: "desc",
  page: 1,
  pageSize: 10,
};

export function DashboardClient({ initialJobs, initialResume, stats, username }: DashboardClientProps) {
  const [jobs, setJobs] = useState(initialJobs);
  const [resume, setResume] = useState(initialResume);
  const [resumeFile, setResumeFile] = useState<File | null>(null);
  const [resumeMessage, setResumeMessage] = useState("");
  const [resumeOpen, setResumeOpen] = useState(false);
  const [query, setQuery] = useState<QueryState>({
    ...defaultQuery,
    page: initialJobs.page,
    pageSize: initialJobs.pageSize,
  });
  const [searchText, setSearchText] = useState("");
  const [isPending, startTransition] = useTransition();

  const activeFilters = useMemo(
    () =>
      Boolean(
        query.q ||
          query.source ||
          query.workMode ||
          query.status ||
          query.favorite !== undefined ||
          query.resumeMatched ||
          query.matchScoreSort !== "desc" ||
          query.page !== 1,
      ),
    [query],
  );

  function runSearch(nextQuery: QueryState) {
    const normalizedQuery = normalizeQuery(nextQuery);
    setQuery(normalizedQuery);

    startTransition(async () => {
      const response = await fetch("/api/jobs", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(normalizedQuery),
      });

      if (!response.ok) return;
      setJobs(await response.json());
    });
  }

  function handleSearch(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    runSearch({ ...query, q: searchText, page: 1 });
  }

  async function handleResumeSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setResumeMessage("Extracting resume profile...");
    const body = new FormData();
    if (resumeFile) body.set("resume", resumeFile);

    const response = await fetch("/api/resume", {
      method: "POST",
      body,
    });
    const payload = await response.json().catch(() => ({}));

    if (!response.ok) {
      setResumeMessage(payload.error ?? "Resume update failed.");
      return;
    }

    setResume({
      ...payload.parsed,
      updatedAt: new Date().toISOString(),
    });
    setResumeFile(null);
    setResumeMessage(
      `Resume profile updated. Raw resume text was not stored. Matched jobs: ${payload.scoredJobs}.`,
    );
    setResumeOpen(false);
    runSearch({ ...query, resumeMatched: true, matchScoreSort: "desc", page: 1 });
  }

  async function handleResumeFile(file: File | undefined) {
    if (!file) return;
    setResumeFile(file);
  }

  return (
    <main className="shell">
      <header className="topbar">
        <div className="brand">
          <h1>Job Scraper</h1>
        </div>
        <div className="topbar-actions">
          {username ? <span className="session-pill">{username}</span> : null}
          {username ? (
            <form action="/api/auth/logout" method="post">
              <button className="button logout-button" type="submit" title="Logout">
                <LogOut size={17} />
              </button>
            </form>
          ) : null}
        </div>
      </header>

      <section className="stats stat-strip" aria-label="Job statistics">
        <Stat
          label="Total"
          value={stats.total}
          active={!query.status && query.favorite === undefined}
          onClick={() => runSearch({ ...query, status: undefined, favorite: undefined, page: 1 })}
        />
        <Stat label="New 24h" value={stats.recent} />
        <Stat
          label="Saved"
          value={stats.saved}
          active={query.status === "SAVED"}
          onClick={() => runSearch({ ...query, status: "SAVED", favorite: undefined, page: 1 })}
        />
        <Stat
          label="Applied"
          value={stats.applied}
          active={query.status === "APPLIED"}
          onClick={() => runSearch({ ...query, status: "APPLIED", favorite: undefined, page: 1 })}
        />
        <Stat
          label="Favorites"
          value={stats.favorites}
          active={query.favorite === true}
          onClick={() => runSearch({ ...query, status: undefined, favorite: true, page: 1 })}
        />
      </section>

      <form className={`filters search-panel ${resume ? "has-score-sort" : ""}`} onSubmit={handleSearch}>
        <input
          className="input search-input"
          value={searchText}
          onChange={(event) => setSearchText(event.target.value)}
          placeholder="Search jobs, skills, companies"
        />
        {resume ? (
          <div className="score-sort-control" aria-label="Sort by match score">
            <button
              className={`score-sort-button ${query.matchScoreSort !== "asc" ? "active" : ""}`}
              type="button"
              title="Score high to low"
              aria-pressed={query.matchScoreSort !== "asc"}
              onClick={() =>
                runSearch({
                  ...query,
                  resumeMatched: true,
                  matchScoreSort: "desc",
                  page: 1,
                })
              }
            >
              <ArrowDownWideNarrow size={15} />
              High
            </button>
            <button
              className={`score-sort-button ${query.matchScoreSort === "asc" ? "active" : ""}`}
              type="button"
              title="Score low to high"
              aria-pressed={query.matchScoreSort === "asc"}
              onClick={() =>
                runSearch({
                  ...query,
                  resumeMatched: true,
                  matchScoreSort: "asc",
                  page: 1,
                })
              }
            >
              <ArrowUpWideNarrow size={15} />
              Low
            </button>
          </div>
        ) : null}
        <button className="button primary" type="submit" disabled={isPending}>
          <Search size={17} />
          Search
        </button>
        <button
          className="button resume-open-button"
          type="button"
          onClick={() => setResumeOpen(true)}
        >
          <FileText size={17} />
          Resume Match
        </button>
        <button
          className="icon-button reset-button"
          type="button"
          title="Reset filters"
          onClick={() => {
            setSearchText("");
            runSearch(defaultQuery);
          }}
        >
          <RotateCcw className={isPending ? "spin-icon" : ""} size={18} />
        </button>
      </form>

      <div className="layout">
        <section className="job-list" aria-label="Jobs">
          {query.resumeMatched ? (
            <div className="match-context">
              <div>
                <strong>Resume matches</strong>
                <span>Showing jobs filtered and sorted by your match profile.</span>
              </div>
              <button
                className="button"
                type="button"
                onClick={() => runSearch({ ...query, resumeMatched: undefined, matchScoreSort: "desc", page: 1 })}
              >
                Show all jobs
              </button>
            </div>
          ) : null}
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
                    {typeof job.matchScore === "number" ? (
                      <span className="match-badge">{job.matchScore}% match</span>
                    ) : null}
                  </h2>
                  <div className="job-lines">
                    {displayOptional(job.company) ? <div>{displayOptional(job.company)}</div> : null}
                    {displayOptional(job.location) ? <div>{displayOptional(job.location)}</div> : null}
                    <div className="detail-row">
                      {job.workMode !== "UNKNOWN" ? <span>{job.workMode}</span> : null}
                      {displayOptional(job.salary) ? <span>{displayOptional(job.salary)}</span> : null}
                      {job.postedAt ? (
                        <span className="posted-date">
                          <CalendarDays size={14} /> {formatDate(job.postedAt)}
                        </span>
                      ) : (
                        <span className="posted-date">
                          <CalendarDays size={14} /> Seen {formatDate(job.firstSeenAt)}
                        </span>
                      )}
                      {job.employmentType ? <span>{job.employmentType}</span> : null}
                    </div>
                  </div>
                  <div className="badge-row">
                    {job.matchedSkills?.slice(0, 5).map((skill) => (
                      <span className="badge match-tech" key={"match-" + skill}>
                        {skill}
                      </span>
                    ))}
                    {job.technologies.slice(0, 10).map((technology) => (
                      <button
                        className="badge badge-button"
                        type="button"
                        key={technology}
                        onClick={() => {
                          setSearchText(technology);
                          runSearch({ ...query, q: technology, page: 1 });
                        }}
                      >
                        {technology}
                      </button>
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
              <button
                className="button"
                type="button"
                disabled={jobs.page <= 1 || isPending}
                onClick={() => runSearch({ ...query, page: Math.max(1, jobs.page - 1) })}
              >
                Previous
              </button>
              <button
                className="button"
                type="button"
                disabled={jobs.page >= jobs.pages || isPending}
                onClick={() => runSearch({ ...query, page: Math.min(Math.max(jobs.pages, 1), jobs.page + 1) })}
              >
                Next
              </button>
            </div>
          </div>
        </section>

        <aside className="side-panel">
          <h2>Sources</h2>
          {stats.bySource.length === 0 ? (
            <p>No scrape data yet.</p>
          ) : (
            stats.bySource.map((source) => (
              <button
                className={[
                  "source-row",
                  query.source === source.source ? "active" : "",
                ]
                  .filter(Boolean)
                  .join(" ")}
                type="button"
                onClick={() => runSearch({ ...query, source: source.source, page: 1 })}
                key={source.source}
              >
                <span>{source.source}</span>
                <strong>{source.count}</strong>
              </button>
            ))
          )}

          <h2 className="side-heading">Work Modes</h2>
          {stats.byWorkMode.map((mode) => (
            <button
              className={[
                "source-row",
                query.workMode === mode.workMode ? "active" : "",
              ]
                .filter(Boolean)
                .join(" ")}
              type="button"
              onClick={() => runSearch({ ...query, workMode: mode.workMode as QueryState["workMode"], page: 1 })}
              key={mode.workMode}
            >
              <span>{mode.workMode}</span>
              <strong>{mode.count}</strong>
            </button>
          ))}

          {activeFilters ? (
            <button
              className="button clear-button"
              type="button"
              onClick={() => {
                setSearchText("");
                runSearch(defaultQuery);
              }}
            >
              Clear filters
            </button>
          ) : null}
        </aside>
      </div>

      {resumeOpen ? (
        <div className="modal-backdrop" role="presentation">
          <section className="modal-panel" role="dialog" aria-modal="true" aria-labelledby="resume-title">
            <header className="modal-header">
              <div>
                <h2 id="resume-title">Resume Match</h2>
                <div className="privacy-note">
                  <p><strong>Stored:</strong> skills, roles, locations, keywords, and match scores.</p>
                  <p><strong>Not stored:</strong> PDF files or raw resume text.</p>
                  <p>Uploading a new resume replaces the current match profile.</p>
                </div>
              </div>
              <button
                className="icon-button"
                type="button"
                title="Close"
                onClick={() => setResumeOpen(false)}
              >
                <X size={18} />
              </button>
            </header>

            {resume ? (
              <div className="resume-summary">
                <span>{resume.skills.length} skills</span>
                <span>{resume.roles.length} roles</span>
                <span>{resume.locations.length} locations</span>
              </div>
            ) : null}

            <form onSubmit={handleResumeSubmit}>
              <input
                className="input resume-file"
                type="file"
                accept=".pdf,application/pdf"
                onChange={(event) => void handleResumeFile(event.currentTarget.files?.[0])}
              />
              {resumeFile ? <p className="resume-message">Selected: {resumeFile.name}</p> : null}
              <button className="button primary resume-button" type="submit">
                Update match profile
              </button>
            </form>
            {resumeMessage ? <p className="resume-message">{resumeMessage}</p> : null}
          </section>
        </div>
      ) : null}
    </main>
  );
}

function Stat({
  label,
  value,
  active,
  onClick,
}: {
  label: string;
  value: number;
  active?: boolean;
  onClick?: () => void;
}) {
  if (onClick) {
    return (
      <button
        className={["stat", "stat-button", active ? "active" : ""]
          .filter(Boolean)
          .join(" ")}
        type="button"
        onClick={onClick}
      >
        <span>{label}</span>
        <strong>{value}</strong>
      </button>
    );
  }

  return (
    <div className="stat">
      <span>{label}</span>
      <strong>{value}</strong>
    </div>
  );
}

function normalizeQuery(query: QueryState): QueryState {
  return {
    q: query.q?.trim() || undefined,
    source: query.source || undefined,
    workMode: query.workMode || undefined,
    status: query.status || undefined,
    favorite: query.favorite,
    resumeMatched: query.resumeMatched || undefined,
    matchScoreSort: query.matchScoreSort === "asc" ? "asc" : "desc",
    page: query.page || 1,
    pageSize: query.pageSize || 10,
  };
}

function formatDate(value: Date | string) {
  return new Intl.DateTimeFormat("en-GB", {
    day: "numeric",
    month: "short",
    year: "numeric",
  }).format(new Date(value));
}

function displayOptional(value: string | null) {
  const text = cleanDisplayText(value);
  if (!text) return "";
  if (/^(unknown|n\/?a|none|null|salary not listed|tech stack not listed)$/i.test(text)) return "";
  return text;
}

function cleanDisplayText(value: string | null) {
  return (value ?? "")
    .replace(/\b\S*_with_bool_\S*\b/g, " ")
    .replace(/^\(\(env,\s*targets\).*$/s, "")
    .replace(/^By continuing to use our platform, you:.*?Skip to content\s*/i, "")
    .replace(/^Skip to main content LinkedIn.*?(?=LinkedIn Jobs|Senior|Junior|Developer|Engineer|Manager|Analyst|Apply|Save)/i, "")
    .replace(/^LinkedIn Jobs Clear text Clear text Sign in Join now\s*/i, "")
    .replace(/\s+/g, " ")
    .trim();
}

function truncate(value: string, max: number) {
  return value.length > max ? value.slice(0, max - 1) + "..." : value;
}
