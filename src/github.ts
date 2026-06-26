export interface GitHubEvent {
  type: string;
  repo: { name: string };
  payload: Record<string, unknown>;
  created_at: string;
}

export interface StandupData {
  username: string;
  since: string;
  commits: { repo: string; message: string; sha: string; url: string }[];
  prsOpened: { repo: string; title: string; number: number; url: string }[];
  prsMerged: { repo: string; title: string; number: number; url: string }[];
  prsReviewed: { repo: string; title: string; number: number; url: string }[];
  issuesOpened: { repo: string; title: string; number: number; url: string }[];
  issuesClosed: { repo: string; title: string; number: number; url: string }[];
}

async function githubFetch(path: string, token: string): Promise<unknown> {
  const res = await fetch(`https://api.github.com${path}`, {
    headers: {
      Authorization: `Bearer ${token}`,
      Accept: "application/vnd.github+json",
      "X-GitHub-Api-Version": "2022-11-28",
    },
  });

  if (!res.ok) {
    const body = await res.text();
    throw new Error(`GitHub API error ${res.status}: ${body}`);
  }

  return res.json();
}

export async function fetchStandup(
  token: string,
  username: string,
  hoursBack: number
): Promise<StandupData> {
  const since = new Date(Date.now() - hoursBack * 60 * 60 * 1000);
  const sinceISO = since.toISOString();

  // Fetch up to 3 pages of user events (300 events max — enough for any active dev)
  const allEvents: GitHubEvent[] = [];
  for (let page = 1; page <= 3; page++) {
    const events = (await githubFetch(
      `/users/${username}/events?per_page=100&page=${page}`,
      token
    )) as GitHubEvent[];

    if (!events.length) break;

    const filtered = events.filter(
      (e) => new Date(e.created_at) >= since
    );
    allEvents.push(...filtered);

    // If the last event on this page is older than our window, stop paginating
    if (new Date(events[events.length - 1].created_at) < since) break;
  }

  const data: StandupData = {
    username,
    since: sinceISO,
    commits: [],
    prsOpened: [],
    prsMerged: [],
    prsReviewed: [],
    issuesOpened: [],
    issuesClosed: [],
  };

  for (const event of allEvents) {
    const repo = event.repo.name;

    if (event.type === "PushEvent") {
      const commits = event.payload.commits as Array<{
        message: string;
        sha: string;
        url: string;
      }> | undefined;
      for (const c of commits ?? []) {
        data.commits.push({
          repo,
          message: c.message.split("\n")[0], // first line only
          sha: c.sha.slice(0, 7),
          url: c.url
            .replace("api.github.com/repos", "github.com")
            .replace("/commits/", "/commit/"),
        });
      }
    }

    if (event.type === "PullRequestEvent") {
      const pr = event.payload.pull_request as {
        title: string;
        number: number;
        html_url: string;
        merged: boolean;
      };
      const action = event.payload.action as string;

      if (action === "opened") {
        data.prsOpened.push({ repo, title: pr.title, number: pr.number, url: pr.html_url });
      } else if (action === "closed" && pr.merged) {
        data.prsMerged.push({ repo, title: pr.title, number: pr.number, url: pr.html_url });
      }
    }

    if (event.type === "PullRequestReviewEvent") {
      const pr = event.payload.pull_request as {
        title: string;
        number: number;
        html_url: string;
      };
      data.prsReviewed.push({ repo, title: pr.title, number: pr.number, url: pr.html_url });
    }

    if (event.type === "IssuesEvent") {
      const issue = event.payload.issue as {
        title: string;
        number: number;
        html_url: string;
      };
      const action = event.payload.action as string;

      if (action === "opened") {
        data.issuesOpened.push({ repo, title: issue.title, number: issue.number, url: issue.html_url });
      } else if (action === "closed") {
        data.issuesClosed.push({ repo, title: issue.title, number: issue.number, url: issue.html_url });
      }
    }
  }

  return data;
}

export function formatStandup(data: StandupData, hoursBack: number): string {
  const lines: string[] = [];
  lines.push(`## Daily Standup — @${data.username}`);
  lines.push(`_Last ${hoursBack}h of GitHub activity_\n`);

  const section = (
    title: string,
    items: { repo: string; title?: string; message?: string; number?: number; sha?: string; url: string }[]
  ) => {
    if (!items.length) return;
    lines.push(`### ${title}`);
    for (const item of items) {
      const label = item.message ?? item.title ?? "";
      const ref = item.number != null ? `#${item.number}` : item.sha ?? "";
      lines.push(`- **${item.repo}** ${ref ? `(${ref})` : ""} — ${label}`);
      lines.push(`  ${item.url}`);
    }
    lines.push("");
  };

  section("Commits", data.commits);
  section("PRs Opened", data.prsOpened);
  section("PRs Merged", data.prsMerged);
  section("PRs Reviewed", data.prsReviewed);
  section("Issues Opened", data.issuesOpened);
  section("Issues Closed", data.issuesClosed);

  const total =
    data.commits.length +
    data.prsOpened.length +
    data.prsMerged.length +
    data.prsReviewed.length +
    data.issuesOpened.length +
    data.issuesClosed.length;

  if (total === 0) {
    lines.push("_No GitHub activity found in this time window._");
  }

  return lines.join("\n");
}
