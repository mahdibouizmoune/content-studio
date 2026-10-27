# 00 — Skills and Tools

Audit date: 2026-10-27. Environment: Claude Code inside the Claude desktop app (Code tab), Windows 11, Node 24.16.0, npm 11.15.0 (global) / 11.14.1 (project fallback `.codex-tools`), Git 2.53, gh 2.92, Python 3.14, Playwright 1.62.1 (project devDependency).

## Environment findings

- No `claude` CLI on PATH. The desktop app runs its own copy, so `/plugin install` and `claude plugin`/`claude mcp` commands are **not available to the agent**. Plugins must be installed by the user from the app or an interactive `claude` terminal.
- The official marketplace (`anthropics/claude-plugins-official`, 315 plugins) is cloned locally at `~/.claude/plugins/marketplaces/claude-plugins-official`, which allowed offline review of candidate plugin files.
- Org plugin catalog search (pinterest, SEO, WordPress, security, browser testing, content quality): no results.
- No project `CLAUDE.md`, no `.claude/` directory and no hooks existed before this audit.
- Already available and used: `code-review`, `security-review`, `simplify`, `run`, `anthropic-skills:skill-creator`, the marketing / hyper-marketing / ad-creative plugin skills, the built-in browser pane, Apify MCP, WebSearch/WebFetch, Explore subagents.

## Candidate evaluation

| Skill or Tool | Source | Purpose | Security Review | Installation Status | Test Result |
|---|---|---|---|---|---|
| security-guidance | official marketplace `plugins/security-guidance` | Edit-time security warnings + LLM diff review | Adds SessionStart (`ensure_agent_sdk.py`, installs Python SDK), UserPromptSubmit, PostToolUse and Stop hooks; an extra LLM review on every stop (cost, latency, persistent) | **Rejected** — persistent hooks with recurring cost; built-in `security-review` covers the need | n/a |
| claude-security | official `plugins/claude-security` | Deep vulnerability scan with verifier agents | Hooks only show banners/metrics; agents run in-session | Not installed (no CLI); recommended optional | n/a |
| playwright MCP | official `external_plugins/playwright` | Browser automation | Runs `npx @playwright/mcp@latest` — **unpinned** remote package | **Rejected** — project already pins Playwright 1.62.1 and the app has a browser pane | n/a |
| context7 | official `external_plugins/context7` | Library docs lookup | Remote HTTP MCP to mcp.context7.com (queries leave the machine) | **Rejected** — official docs fetched directly instead | n/a |
| skill-creator | official `plugins/skill-creator` | Author/test skills | Skill-only, no hooks | Already available as `anthropic-skills:skill-creator` | Used for skill structure |
| claude-code-setup | official | Recommend automations | Skill-only | Not needed — analysis done manually | n/a |
| frontend-design | official | Visual UI generation | Skill-only | Not needed — the brief forbids cosmetic redesign | n/a |
| Existing project Playwright | `node_modules/playwright` 1.62.1 | Electron screen sweep, UI fixtures | Pinned by lockfile | In use | Sweep: 22 screens, 0 errors |

## Project skills created (`.claude/skills/`)

| Skill | Purpose | Verified |
|---|---|---|
| `content-studio-verify` | Full regression/release check with isolated profile; bundled `scripts/screen-sweep.cjs` | Script run from the skill folder: `TOTAL_PROBLEMS 0`. Skill discovery happens at the next session start (not verifiable inside this session). |
| `recipe-publish-qa` | Where recipe gates live, non-negotiables, dated Google Recipe rules, test-first procedure | Frontmatter checked; procedure used for this audit's recipe fixes |
| `pinterest-csv-guardrails` | User Pinterest requirements + dated platform limits | Frontmatter checked |

Nothing was downloaded or executed from third-party sources. No credentials were read or exposed.
