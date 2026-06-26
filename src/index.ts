#!/usr/bin/env node
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { z } from "zod";
import { fetchStandup, formatStandup } from "./github.js";

const ENV_TOKEN = process.env.GITHUB_TOKEN ?? "";

const server = new McpServer({
  name: "standupbot-mcp",
  version: "1.0.0",
});

server.tool(
  "get_standup",
  "Fetch your GitHub activity for the last N hours and format it as a standup report — commits, PRs opened/merged, reviews, and issues.",
  {
    github_token: z
      .string()
      .optional()
      .describe(
        "GitHub personal access token. If omitted, uses the GITHUB_TOKEN env var set in MCP config."
      ),
    username: z
      .string()
      .describe("Your GitHub username, e.g. 'torvalds'"),
    hours_back: z
      .number()
      .int()
      .min(1)
      .max(72)
      .default(24)
      .describe("How many hours back to look. Default 24."),
  },
  async ({ github_token, username, hours_back }) => {
    const token = github_token || ENV_TOKEN;
    if (!token) throw new Error("No GitHub token provided. Set GITHUB_TOKEN env var or pass github_token.");
    const data = await fetchStandup(token, username, hours_back ?? 24);
    const report = formatStandup(data, hours_back ?? 24);
    return { content: [{ type: "text", text: report }] };
  }
);

server.tool(
  "get_standup_multi",
  "Fetch GitHub activity for multiple users (e.g. your whole team) and return a combined standup report.",
  {
    github_token: z
      .string()
      .describe("GitHub personal access token with read access to each user's events."),
    usernames: z
      .array(z.string())
      .min(1)
      .max(10)
      .describe("List of GitHub usernames to include, e.g. ['alice', 'bob']"),
    hours_back: z
      .number()
      .int()
      .min(1)
      .max(72)
      .default(24)
      .describe("How many hours back to look. Default 24."),
  },
  async ({ github_token, usernames, hours_back }) => {
    const token = github_token || ENV_TOKEN;
    if (!token) throw new Error("No GitHub token provided. Set GITHUB_TOKEN env var or pass github_token.");
    const hours = hours_back ?? 24;
    const reports = await Promise.all(
      usernames.map(async (u) => {
        try {
          const data = await fetchStandup(token, u, hours);
          return formatStandup(data, hours);
        } catch (err) {
          return `## @${u}\n_Error fetching activity: ${(err as Error).message}_`;
        }
      })
    );
    return {
      content: [{ type: "text", text: reports.join("\n\n---\n\n") }],
    };
  }
);

server.tool(
  "get_repo_pulse",
  "Get recent activity (commits, PRs, issues) on a specific repository for the last N hours.",
  {
    github_token: z
      .string()
      .describe("GitHub personal access token."),
    owner: z.string().describe("Repository owner, e.g. 'facebook'"),
    repo: z.string().describe("Repository name, e.g. 'react'"),
    hours_back: z
      .number()
      .int()
      .min(1)
      .max(72)
      .default(24)
      .describe("How many hours back to look. Default 24."),
  },
  async ({ github_token, owner, repo, hours_back }) => {
    const token = github_token || ENV_TOKEN;
    if (!token) throw new Error("No GitHub token provided. Set GITHUB_TOKEN env var or pass github_token.");
    const hours = hours_back ?? 24;
    const since = new Date(Date.now() - hours * 60 * 60 * 1000).toISOString();

    async function ghFetch(path: string) {
      const res = await fetch(`https://api.github.com${path}`, {
        headers: {
          Authorization: `Bearer ${token}`,
          Accept: "application/vnd.github+json",
          "X-GitHub-Api-Version": "2022-11-28",
        },
      });
      if (!res.ok) throw new Error(`GitHub ${res.status}: ${await res.text()}`);
      return res.json();
    }

    const [commits, prs, issues] = await Promise.all([
      ghFetch(`/repos/${owner}/${repo}/commits?since=${since}&per_page=20`),
      ghFetch(`/repos/${owner}/${repo}/pulls?state=all&sort=updated&direction=desc&per_page=20`),
      ghFetch(`/repos/${owner}/${repo}/issues?state=all&sort=updated&direction=desc&since=${since}&per_page=20`),
    ]);

    const lines: string[] = [];
    lines.push(`## Repo Pulse — ${owner}/${repo}`);
    lines.push(`_Last ${hours}h_\n`);

    const recentCommits = (commits as Array<{ sha: string; commit: { message: string }; html_url: string; author?: { login: string } }>)
      .slice(0, 10);
    if (recentCommits.length) {
      lines.push("### Recent Commits");
      for (const c of recentCommits) {
        const author = c.author?.login ?? "unknown";
        const msg = c.commit.message.split("\n")[0];
        lines.push(`- **@${author}** — ${msg}`);
        lines.push(`  ${c.html_url}`);
      }
      lines.push("");
    }

    const recentPRs = (prs as Array<{ number: number; title: string; state: string; merged_at: string | null; html_url: string; user: { login: string }; updated_at: string }>)
      .filter((p) => new Date(p.updated_at) >= new Date(since))
      .slice(0, 10);
    if (recentPRs.length) {
      lines.push("### Pull Requests");
      for (const p of recentPRs) {
        const status = p.merged_at ? "merged" : p.state;
        lines.push(`- [${status.toUpperCase()}] **#${p.number}** ${p.title} (@${p.user.login})`);
        lines.push(`  ${p.html_url}`);
      }
      lines.push("");
    }

    const recentIssues = (issues as Array<{ number: number; title: string; state: string; html_url: string; user: { login: string }; pull_request?: unknown }>)
      .filter((i) => !i.pull_request) // exclude PRs that show up in issues endpoint
      .slice(0, 10);
    if (recentIssues.length) {
      lines.push("### Issues");
      for (const i of recentIssues) {
        lines.push(`- [${i.state.toUpperCase()}] **#${i.number}** ${i.title} (@${i.user.login})`);
        lines.push(`  ${i.html_url}`);
      }
    }

    return { content: [{ type: "text", text: lines.join("\n") }] };
  }
);

async function main() {
  const transport = new StdioServerTransport();
  await server.connect(transport);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
