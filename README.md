# StandupBot MCP

> "What did I even do yesterday?" — solved.

**StandupBot** is a free [Model Context Protocol](https://modelcontextprotocol.io) server that connects Claude to your GitHub activity. Ask Claude for your standup and it pulls the last 24h of commits, PRs, reviews, and issues — formatted and ready to paste into Slack.

---

## Tools

| Tool | What it does |
|---|---|
| `get_standup` | Your personal standup — commits, PRs, reviews, issues in the last N hours |
| `get_standup_multi` | Team standup — same thing for a list of GitHub usernames |
| `get_repo_pulse` | Recent activity on any public or private repo |

---

## Quick Start

### 1. Get a GitHub token

Go to **GitHub → Settings → Developer settings → Personal access tokens → Tokens (classic)**.

Create a token with these scopes:
- `repo` (to see private repos)
- `read:user`

### 2. Add to Claude Code

Add this to your Claude Code config (`~/.claude/claude_desktop_config.json` for Claude Desktop, or `.claude/settings.json` for Claude Code CLI):

```json
{
  "mcpServers": {
    "standupbot": {
      "command": "npx",
      "args": ["-y", "standupbot-mcp"],
      "env": {
        "GITHUB_TOKEN": "ghp_your_token_here"
      }
    }
  }
}
```

### 3. Ask Claude

```
Give me my standup for the last 24 hours. My GitHub username is alice.
```

```
Generate a team standup for usernames: alice, bob, carol
```

```
What's been happening in the facebook/react repo today?
```

---

## Example Output

```
## Daily Standup — @alice
_Last 24h of GitHub activity_

### Commits
- **alice/my-app** (a3f9c12) — fix: resolve race condition in auth middleware
  https://github.com/alice/my-app/commit/a3f9c12

### PRs Opened
- **alice/my-app** (#42) — feat: add OAuth2 support
  https://github.com/alice/my-app/pull/42

### PRs Reviewed
- **team-org/backend** (#99) — refactor: extract payment service
  https://github.com/team-org/backend/pull/99
```

---

## Environment Variables

You can set `GITHUB_TOKEN` as an env var in your MCP config and omit it from tool calls:

```json
"env": { "GITHUB_TOKEN": "ghp_..." }
```

The tool will fall back to the env var automatically if no token is passed.

---

## Privacy

- Your token is stored only in your local config file.
- StandupBot makes direct HTTPS calls to `api.github.com` — no proxy, no telemetry, no servers.
- 100% open source. MIT license.

---

## License

MIT
