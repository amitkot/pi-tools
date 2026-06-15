import { execFile } from "node:child_process";
import { promisify } from "node:util";
import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";
import { Type } from "typebox";

const execFileAsync = promisify(execFile);

// =============================================================================
// Constants
// =============================================================================

const EXEC_TIMEOUT = 30_000; // 30 seconds
const MAX_BUFFER = 1024 * 1024; // 1 MB
const MAX_OUTPUT_CHARS = 4000;
const MAX_ERROR_CHARS = 500;
const PR_STATES = new Set(["open", "closed", "merged", "all"]);

// =============================================================================
// Helpers
// =============================================================================

function commandLabel(cmd: string, args: string[]): string {
  return [cmd, ...args.slice(0, 3)].join(" ");
}

function sanitizeStderr(stderr: string | undefined): string {
  if (!stderr) return "";
  let text = stderr.trim();

  // Redact common GitHub token forms.
  text = text.replace(/\bgh[pousr]_[A-Za-z0-9_]+\b/g, "[redacted-token]");
  text = text.replace(/\bgithub_pat_[A-Za-z0-9_]+\b/g, "[redacted-token]");

  // Avoid exposing full home-local credential/config paths.
  if (process.env.HOME) {
    text = text.replaceAll(process.env.HOME, "~");
  }

  if (text.length > MAX_ERROR_CHARS) {
    text = `${text.slice(0, MAX_ERROR_CHARS)}... [truncated]`;
  }
  return text;
}

/**
 * Run a command with argument arrays (no shell). Returns { stdout, stderr } or
 * throws a sanitized error that does not leak tokens, credential paths, or
 * environment variables.
 */
async function run(
  cmd: string,
  args: string[],
  options: { cwd: string; timeout?: number },
): Promise<{ stdout: string; stderr: string }> {
  const timeout = options.timeout ?? EXEC_TIMEOUT;
  try {
    const { stdout, stderr } = await execFileAsync(cmd, args, {
      cwd: options.cwd,
      encoding: "utf-8",
      maxBuffer: MAX_BUFFER,
      timeout,
      env: {
        // Inherit a minimal set of environment variables so gh and git can
        // locate credentials and SSH agent. Do NOT forward the full process.env
        // (avoids leaking secrets).
        HOME: process.env.HOME ?? "",
        PATH: process.env.PATH ?? "",
        ...(process.env.SSH_AUTH_SOCK ? { SSH_AUTH_SOCK: process.env.SSH_AUTH_SOCK } : {}),
        ...(process.env.GH_CONFIG_DIR ? { GH_CONFIG_DIR: process.env.GH_CONFIG_DIR } : {}),
        ...(process.env.XDG_CONFIG_HOME ? { XDG_CONFIG_HOME: process.env.XDG_CONFIG_HOME } : {}),
      },
    });
    return { stdout, stderr };
  } catch (error: any) {
    const label = commandLabel(cmd, args);
    if (error.code === "ETIMEDOUT") {
      throw new Error(`${label} timed out after ${timeout}ms`);
    }

    const stderr = sanitizeStderr(error.stderr);
    throw new Error(`${label} failed${stderr ? `: ${stderr}` : ""}`);
  }
}

function git(args: string[], cwd: string): Promise<{ stdout: string; stderr: string }> {
  return run("git", args, { cwd });
}

function gh(args: string[], cwd: string): Promise<{ stdout: string; stderr: string }> {
  return run("gh", args, { cwd });
}

/**
 * Parse a GitHub remote URL of the forms:
 *   https://github.com/OWNER/REPO.git
 *   https://github.com/OWNER/REPO
 *   git@github.com:OWNER/REPO.git
 *   ssh://git@github.com/OWNER/REPO.git
 */
export function parseGitHubRemote(remoteUrl: string): { owner: string; repo: string } | null {
  const trimmed = remoteUrl.trim();

  const httpsMatch = trimmed.match(
    /^https:\/\/github\.com\/([^/]+)\/([^/\s]+?)(?:\.git)?$/,
  );
  if (httpsMatch) return { owner: httpsMatch[1], repo: httpsMatch[2] };

  const scpMatch = trimmed.match(
    /^git@github\.com:([^/]+)\/([^/\s]+?)(?:\.git)?$/,
  );
  if (scpMatch) return { owner: scpMatch[1], repo: scpMatch[2] };

  const sshMatch = trimmed.match(
    /^ssh:\/\/git@github\.com\/([^/]+)\/([^/\s]+?)(?:\.git)?$/,
  );
  if (sshMatch) return { owner: sshMatch[1], repo: sshMatch[2] };

  return null;
}

function truncate(text: string, maxChars: number = MAX_OUTPUT_CHARS): string {
  if (text.length <= maxChars) return text;
  return `${text.slice(0, maxChars)}\n\n... [truncated]`;
}

export function requirePositiveInteger(value: number, label: string): void {
  if (!Number.isInteger(value) || value <= 0) {
    throw new Error(`${label} must be a positive integer.`);
  }
}

export function isGitHubPrUrl(url: string): boolean {
  return /^https:\/\/github\.com\/[^/\s]+\/[^/\s]+\/pull\/\d+(?:[/?#].*)?$/.test(url.trim());
}

export function normalizePrListLimit(input: number | undefined): number {
  const raw = input ?? 20;
  if (!Number.isFinite(raw)) {
    throw new Error("limit must be a finite number.");
  }
  return Math.min(Math.max(Math.trunc(raw), 1), 50);
}

// =============================================================================
// Repository info
// =============================================================================

interface RepoInfo {
  owner: string;
  repo: string;
  currentBranch: string;
  defaultBranch: string;
  repoUrl: string;
  worktreeRoot: string;
}

async function getRepoInfo(cwd: string): Promise<RepoInfo> {
  const { stdout: root } = await git(["rev-parse", "--show-toplevel"], cwd);
  const { stdout: remoteUrl } = await git(["remote", "get-url", "origin"], cwd);
  const { stdout: branch } = await git(["branch", "--show-current"], cwd);

  if (!branch.trim()) {
    throw new Error("Detached HEAD. Please checkout a branch before proceeding.");
  }

  const parsed = parseGitHubRemote(remoteUrl);
  if (!parsed) {
    throw new Error(`Origin remote is not an unambiguous GitHub remote: ${remoteUrl.trim()}`);
  }

  const { owner, repo } = parsed;
  const { stdout: ghInfoStr } = await gh(
    ["repo", "view", `${owner}/${repo}`, "--json", "nameWithOwner,defaultBranchRef,url"],
    cwd,
  );
  const ghInfo = JSON.parse(ghInfoStr);

  return {
    owner,
    repo,
    currentBranch: branch.trim(),
    defaultBranch: ghInfo.defaultBranchRef.name,
    repoUrl: ghInfo.url,
    worktreeRoot: root.trim(),
  };
}

// =============================================================================
// Safety assertions
// =============================================================================

async function assertCleanWorktree(cwd: string): Promise<void> {
  const { stdout } = await git(["status", "--porcelain"], cwd);
  if (stdout.trim()) {
    throw new Error("Worktree is dirty. Please commit or stash changes before creating a PR.");
  }
}

async function assertNotDefaultBranch(info: RepoInfo): Promise<void> {
  if (info.currentBranch === info.defaultBranch) {
    throw new Error(
      `You are on the default branch (${info.defaultBranch}). ` +
        "PR creation is not allowed from the default branch.",
    );
  }
}

async function checkUpstream(cwd: string): Promise<boolean> {
  try {
    const { stdout } = await git(
      ["rev-parse", "--abbrev-ref", "--symbolic-full-name", "@{u}"],
      cwd,
    );
    return stdout.trim().length > 0;
  } catch {
    return false;
  }
}

// =============================================================================
// Tool handlers
// =============================================================================

const AUTH_STATUS_SCHEMA = Type.Object({});

async function handleAuthStatus(
  _toolCallId: string,
  _params: Record<string, never>,
  cwd: string,
): Promise<{ content: { type: "text"; text: string }[]; details: unknown }> {
  try {
    await gh(["auth", "status"], cwd);
    const { stdout: login } = await gh(["api", "/user", "--jq", ".login"], cwd);
    const username = login.trim();
    return {
      content: [{ type: "text", text: `**gh auth:** OK\n**Logged in as:** @${username}` }],
      details: { username, success: true },
    };
  } catch (error: any) {
    return {
      content: [
        {
          type: "text",
          text: `**gh auth:** FAILED\n\n${error.message}\n\nRun \`gh auth login\` on the host if needed.`,
        },
      ],
      details: { success: false, error: error.message },
    };
  }
}

const REPO_INFO_SCHEMA = Type.Object({
  cwd: Type.Optional(Type.String({ description: "Working directory (defaults to Pi session cwd)" })),
});

async function handleRepoInfo(
  _toolCallId: string,
  params: { cwd?: string },
  defaultCwd: string,
): Promise<{ content: { type: "text"; text: string }[]; details: unknown }> {
  const cwd = params.cwd ?? defaultCwd;
  const info = await getRepoInfo(cwd);
  const md = [
    `**Owner:** ${info.owner}`,
    `**Repo:** ${info.repo}`,
    `**Default branch:** ${info.defaultBranch}`,
    `**Current branch:** ${info.currentBranch}`,
    `**URL:** ${info.repoUrl}`,
    `**Worktree root:** ${info.worktreeRoot}`,
  ].join("\n");
  return { content: [{ type: "text", text: md }], details: info };
}

const PR_LIST_SCHEMA = Type.Object({
  state: Type.Optional(
    Type.String({
      enum: ["open", "closed", "merged", "all"],
      default: "open",
      description: "PR state filter (default: open)",
    }),
  ),
  author: Type.Optional(Type.String({ description: "Filter by author login" })),
  head: Type.Optional(Type.String({ description: "Filter by head branch name" })),
  limit: Type.Optional(
    Type.Number({ minimum: 1, maximum: 50, default: 20, description: "Max PRs to return (1-50, default: 20)" }),
  ),
  cwd: Type.Optional(Type.String({ description: "Working directory (defaults to Pi session cwd)" })),
});

async function handlePrList(
  _toolCallId: string,
  params: {
    state?: string;
    author?: string;
    head?: string;
    limit?: number;
    cwd?: string;
  },
  defaultCwd: string,
): Promise<{ content: { type: "text"; text: string }[]; details: unknown }> {
  const cwd = params.cwd ?? defaultCwd;
  const state = params.state ?? "open";
  if (!PR_STATES.has(state)) {
    throw new Error(`state must be one of: ${Array.from(PR_STATES).join(", ")}.`);
  }
  const limit = normalizePrListLimit(params.limit);

  const args = [
    "pr",
    "list",
    "--json",
    "number,title,state,isDraft,headRefName,baseRefName,url,author,updatedAt",
    "--state",
    state,
    "--limit",
    limit.toString(),
  ];
  if (params.author) args.push("--author", params.author);
  if (params.head) args.push("--head", params.head);

  const { stdout } = await gh(args, cwd);
  const prs: unknown[] = JSON.parse(stdout);

  if (prs.length === 0) {
    return { content: [{ type: "text", text: `No ${state} PRs found.` }], details: { prs: [] } };
  }

  const lines = prs.map((pr: any) => {
    const draftTag = pr.isDraft ? " [DRAFT]" : "";
    return [
      `### #${pr.number} — ${pr.title}${draftTag}`,
      `- **State:** ${pr.state} | **Base:** \`${pr.baseRefName}\` → **Head:** \`${pr.headRefName}\``,
      `- **Author:** @${pr.author?.login ?? "unknown"}`,
      `- **Updated:** ${pr.updatedAt}`,
      `- **URL:** ${pr.url}`,
    ].join("\n");
  });

  return { content: [{ type: "text", text: truncate(lines.join("\n\n---\n\n")) }], details: { prs } };
}

const PR_VIEW_SCHEMA = Type.Object({
  number: Type.Optional(Type.Number({ description: "PR number" })),
  url: Type.Optional(Type.String({ description: "PR URL" })),
  cwd: Type.Optional(Type.String({ description: "Working directory (defaults to Pi session cwd)" })),
});

async function handlePrView(
  _toolCallId: string,
  params: { number?: number; url?: string; cwd?: string },
  defaultCwd: string,
): Promise<{ content: { type: "text"; text: string }[]; details: unknown }> {
  const cwd = params.cwd ?? defaultCwd;

  if (params.number !== undefined && params.url !== undefined) {
    throw new Error("Provide either number or url, not both.");
  }
  if (params.number !== undefined) {
    requirePositiveInteger(params.number, "number");
  }
  if (params.url !== undefined && !isGitHubPrUrl(params.url)) {
    throw new Error("url must be a GitHub pull request URL.");
  }

  const jsonFields = [
    "number",
    "title",
    "body",
    "state",
    "isDraft",
    "baseRefName",
    "headRefName",
    "url",
    "reviewDecision",
    "latestReviews",
    "statusCheckRollup",
    "changedFiles",
    "createdAt",
    "author",
  ].join(",");

  const args = ["pr", "view"];
  if (params.number !== undefined) args.push(params.number.toString());
  else if (params.url !== undefined) args.push(params.url);
  args.push("--json", jsonFields);

  const { stdout } = await gh(args, cwd);
  const pr: Record<string, unknown> = JSON.parse(stdout);
  return { content: [{ type: "text", text: truncate(buildPrViewMarkdown(pr)) }], details: { pr } };
}

function summarizeChecks(statusCheckRollup: unknown): string | undefined {
  if (!Array.isArray(statusCheckRollup)) return undefined;
  const total = statusCheckRollup.length;
  if (total === 0) return "0 checks";
  const counts = new Map<string, number>();
  for (const check of statusCheckRollup as any[]) {
    const key = check.conclusion ?? check.status ?? check.state ?? "unknown";
    counts.set(key, (counts.get(key) ?? 0) + 1);
  }
  return Array.from(counts.entries())
    .map(([key, count]) => `${key}: ${count}`)
    .join(", ");
}

function summarizeReviews(latestReviews: unknown): string | undefined {
  if (!Array.isArray(latestReviews)) return undefined;
  if (latestReviews.length === 0) return "0 latest reviews";
  const counts = new Map<string, number>();
  for (const review of latestReviews as any[]) {
    const key = review.state ?? "unknown";
    counts.set(key, (counts.get(key) ?? 0) + 1);
  }
  return Array.from(counts.entries())
    .map(([key, count]) => `${key}: ${count}`)
    .join(", ");
}

function buildPrViewMarkdown(pr: Record<string, unknown>): string {
  const draftTag = pr.isDraft ? " [DRAFT]" : "";
  const lines = [
    `## #${pr.number} — ${pr.title}${draftTag}`,
    "",
    `**State:** ${pr.state} | **Base:** \`${pr.baseRefName}\` → **Head:** \`${pr.headRefName}\``,
    `**URL:** ${pr.url}`,
    `**Author:** @${(pr.author as any)?.login ?? "unknown"}`,
    `**Created:** ${pr.createdAt}`,
    `**Changed files:** ${pr.changedFiles ?? "unknown"}`,
  ];

  if (pr.reviewDecision) lines.push(`**Review decision:** ${pr.reviewDecision}`);
  const reviewSummary = summarizeReviews(pr.latestReviews);
  if (reviewSummary) lines.push(`**Latest reviews:** ${reviewSummary}`);
  const checksSummary = summarizeChecks(pr.statusCheckRollup);
  if (checksSummary) lines.push(`**Checks:** ${checksSummary}`);

  if (pr.body) lines.push("", "### Description", "", truncate(pr.body as string, 2000));
  return lines.join("\n");
}

const PR_CREATE_SCHEMA = Type.Object({
  title: Type.String({ description: "PR title" }),
  body: Type.String({ description: "PR body (markdown)" }),
  base: Type.Optional(Type.String({ description: "Target branch (default: repo default branch)" })),
  draft: Type.Optional(Type.Boolean({ default: false, description: "Create as draft PR" })),
  confirm: Type.Optional(Type.Boolean({ default: false, description: "Set to true to create the PR; omit or false to preview only" })),
  cwd: Type.Optional(Type.String({ description: "Working directory (defaults to Pi session cwd)" })),
});

async function handlePrCreate(
  _toolCallId: string,
  params: {
    title: string;
    body: string;
    base?: string;
    draft?: boolean;
    confirm?: boolean;
    cwd?: string;
  },
  defaultCwd: string,
): Promise<{ content: { type: "text"; text: string }[]; details: unknown }> {
  const cwd = params.cwd ?? defaultCwd;
  if (!params.title?.trim()) throw new Error("PR title is required.");
  if (!params.body?.trim()) throw new Error("PR body is required.");

  const info = await getRepoInfo(cwd);
  await assertNotDefaultBranch(info);
  await assertCleanWorktree(cwd);

  const base = params.base?.trim() || info.defaultBranch;
  const draft = params.draft ?? false;
  const hasUpstream = await checkUpstream(cwd);

  const pushArgv = hasUpstream
    ? ["git", "push"]
    : ["git", "push", "-u", "origin", info.currentBranch];

  const createArgs = ["pr", "create", "--title", params.title, "--body", params.body, "--base", base];
  if (draft) createArgs.push("--draft");

  const createArgvPreview = [
    "gh",
    "pr",
    "create",
    "--title",
    params.title,
    "--body",
    `<${params.body.length} chars>`,
    "--base",
    base,
    ...(draft ? ["--draft"] : []),
  ];

  if (params.confirm !== true) {
    const plannedArgv = [pushArgv, createArgvPreview];
    const md = [
      "### PR Preview",
      "",
      "No mutation was performed.",
      "",
      `**Repo:** ${info.owner}/${info.repo}`,
      `**Branch:** ${info.currentBranch} → **Base:** ${base}`,
      `**Title:** ${params.title}`,
      `**Draft:** ${draft ? "yes" : "no"}`,
      `**Body length:** ${params.body.length} chars`,
      `**Upstream exists:** ${hasUpstream ? "yes" : "no"}`,
      "",
      "**Planned argv arrays (body redacted):**",
      "```json",
      JSON.stringify(plannedArgv, null, 2),
      "```",
      "",
      "Call again with `confirm: true` to create the PR. The Pi permission prompt is the approval gate.",
    ].join("\n");

    return {
      content: [{ type: "text", text: md }],
      details: {
        preview: true,
        repo: `${info.owner}/${info.repo}`,
        branch: info.currentBranch,
        base,
        title: params.title,
        bodyLength: params.body.length,
        draft,
        plannedArgv,
      },
    };
  }

  if (!hasUpstream) {
    await git(["push", "-u", "origin", info.currentBranch], cwd);
  } else {
    await git(["push"], cwd);
  }

  const { stdout } = await gh(createArgs, cwd);
  const prUrl = stdout.match(/https?:\/\/[^\s]+/)?.[0] ?? "unknown URL";

  return { content: [{ type: "text", text: `PR created: ${prUrl}` }], details: { pr_url: prUrl } };
}

// =============================================================================
// Extension entry point
// =============================================================================

export default function safeGithub(pi: ExtensionAPI) {
  pi.registerTool({
    name: "github_auth_status",
    label: "GitHub Auth Status",
    description: "Verify that gh CLI authentication works from the extension process. Returns the logged-in GitHub username.",
    promptSnippet: "Check GitHub CLI auth status and logged-in user",
    promptGuidelines: ["Use github_auth_status to verify GitHub auth before other GitHub operations."],
    parameters: AUTH_STATUS_SCHEMA,
    async execute(toolCallId, params, _signal, _onUpdate, ctx) {
      return handleAuthStatus(toolCallId, params as Record<string, never>, ctx.cwd);
    },
  });

  pi.registerTool({
    name: "github_repo_info",
    label: "GitHub Repo Info",
    description: "Show the current GitHub repository identity (owner, repo name, branches, URL, worktree root).",
    promptSnippet: "Show current GitHub repository identity and branch info",
    promptGuidelines: ["Use github_repo_info to confirm which repo and branch you are operating on before making changes."],
    parameters: REPO_INFO_SCHEMA,
    async execute(toolCallId, params, _signal, _onUpdate, ctx) {
      return handleRepoInfo(toolCallId, params as { cwd?: string }, ctx.cwd);
    },
  });

  pi.registerTool({
    name: "github_pr_list",
    label: "GitHub PR List",
    description: "List PRs for the current repository. Supports filtering by state, author, and head branch.",
    promptSnippet: "List GitHub pull requests with optional filters",
    promptGuidelines: ["Use github_pr_list instead of `gh pr list` to list PRs."],
    parameters: PR_LIST_SCHEMA,
    async execute(toolCallId, params, _signal, _onUpdate, ctx) {
      return handlePrList(toolCallId, params as Parameters<typeof handlePrList>[1], ctx.cwd);
    },
  });

  pi.registerTool({
    name: "github_pr_view",
    label: "GitHub PR View",
    description: "View details for a specific PR by number or URL, or the current branch PR if neither is provided.",
    promptSnippet: "View GitHub pull request details",
    promptGuidelines: ["Use github_pr_view instead of `gh pr view` to inspect PRs."],
    parameters: PR_VIEW_SCHEMA,
    async execute(toolCallId, params, _signal, _onUpdate, ctx) {
      return handlePrView(toolCallId, params as { number?: number; url?: string; cwd?: string }, ctx.cwd);
    },
  });

  pi.registerTool({
    name: "github_pr_create",
    label: "GitHub PR Create",
    description: "Create a pull request for the current branch when confirm is true; preview otherwise.",
    promptSnippet: "Create or preview a GitHub pull request",
    promptGuidelines: [
      "Use github_pr_create instead of `gh pr create` to create PRs.",
      "If the user explicitly asks to create a PR, call github_pr_create with `confirm: true`; the Pi permission prompt is the approval gate.",
      "Use `confirm: false` when the user asks for a preview or the request is ambiguous.",
      "Never use raw `gh api`, `gh auth token`, or shell for GitHub operations when the safe-github tools are available.",
    ],
    parameters: PR_CREATE_SCHEMA,
    async execute(toolCallId, params, _signal, _onUpdate, ctx) {
      return handlePrCreate(toolCallId, params as Parameters<typeof handlePrCreate>[1], ctx.cwd);
    },
  });
}
