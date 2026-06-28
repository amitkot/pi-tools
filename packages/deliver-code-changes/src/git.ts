import { access } from "node:fs/promises";
import path from "node:path";
import { DeliverError, runCommand } from "./output.ts";

export type StatusFile = {
  index: string;
  worktree: string;
  path: string;
  originalPath?: string;
};

export type RepoContext = {
  root: string;
  branch: string;
  base: string;
  gitDir: string;
};

export type AheadBehind = {
  baseAhead: number;
  branchAhead: number;
};

export type BranchPlan =
  | { mode: "current"; branch: string; reasons: string[] }
  | { mode: "fresh"; branch: string; base: string; fromBranch: string; reasons: string[] };

async function exists(filePath: string): Promise<boolean> {
  try {
    await access(filePath);
    return true;
  } catch {
    return false;
  }
}

export function parseStatusPorcelainZ(output: string): StatusFile[] {
  const parts = output.split("\0").filter(Boolean);
  const files: StatusFile[] = [];
  for (let index = 0; index < parts.length; index += 1) {
    const entry = parts[index];
    if (entry.length < 4) continue;
    const status = entry.slice(0, 2);
    const filePath = entry.slice(3);
    const file: StatusFile = {
      index: status[0],
      worktree: status[1],
      path: filePath,
    };
    if (status.includes("R") || status.includes("C")) {
      file.originalPath = parts[index + 1];
      index += 1;
    }
    files.push(file);
  }
  return files;
}

export function parseDefaultBranch(remoteHead: string): string | null {
  const trimmed = remoteHead.trim();
  if (!trimmed) return null;
  const slash = trimmed.indexOf("/");
  return slash >= 0 ? trimmed.slice(slash + 1) : trimmed;
}

export async function getGitRoot(cwd: string): Promise<string> {
  try {
    const { stdout } = await runCommand("git", ["rev-parse", "--show-toplevel"], { cwd });
    return stdout.trim();
  } catch {
    throw new DeliverError("/deliver must be run inside a Git repository.");
  }
}

export async function getCurrentBranch(root: string): Promise<string> {
  try {
    const { stdout } = await runCommand("git", ["symbolic-ref", "--quiet", "--short", "HEAD"], { cwd: root });
    const branch = stdout.trim();
    if (!branch) throw new Error("empty branch");
    return branch;
  } catch {
    throw new DeliverError("Refusing to deliver from detached HEAD.");
  }
}

export async function getGitDir(root: string): Promise<string> {
  const { stdout } = await runCommand("git", ["rev-parse", "--git-dir"], { cwd: root });
  const gitDir = stdout.trim();
  return path.isAbsolute(gitDir) ? gitDir : path.resolve(root, gitDir);
}

export async function detectDefaultBranch(root: string): Promise<string> {
  try {
    const { stdout } = await runCommand("git", ["symbolic-ref", "refs/remotes/origin/HEAD", "--short"], { cwd: root });
    const parsed = parseDefaultBranch(stdout);
    if (parsed) return parsed;
  } catch {
    // Fall back to gh below.
  }

  try {
    const { stdout } = await runCommand("gh", ["repo", "view", "--json", "defaultBranchRef", "--jq", ".defaultBranchRef.name"], { cwd: root });
    const branch = stdout.trim();
    if (branch) return branch;
  } catch {
    // Throw a clearer error below.
  }

  throw new DeliverError("Could not detect the default branch. Configure .pi/deliver.json base.");
}

export async function getRepoContext(cwd: string, configuredBase?: string): Promise<RepoContext> {
  const root = await getGitRoot(cwd);
  const [branch, gitDir] = await Promise.all([getCurrentBranch(root), getGitDir(root)]);
  const base = configuredBase ?? await detectDefaultBranch(root);

  await assertNoGitOperationInProgress(gitDir);

  return { root, branch, base, gitDir };
}

export async function assertNoGitOperationInProgress(gitDir: string): Promise<void> {
  const blocked = [
    ["MERGE_HEAD", "merge"],
    ["rebase-merge", "rebase"],
    ["rebase-apply", "rebase"],
  ] as const;

  for (const [relativePath, operation] of blocked) {
    if (await exists(path.join(gitDir, relativePath))) {
      throw new DeliverError(`Refusing to deliver while a ${operation} is in progress.`);
    }
  }
}

export async function getStatus(root: string): Promise<StatusFile[]> {
  const { stdout } = await runCommand("git", ["status", "--porcelain=v1", "-z"], { cwd: root });
  return parseStatusPorcelainZ(stdout);
}

export function parseAheadBehind(output: string): AheadBehind | null {
  const [baseAheadText, branchAheadText] = output.trim().split(/\s+/);
  const baseAhead = Number.parseInt(baseAheadText, 10);
  const branchAhead = Number.parseInt(branchAheadText, 10);
  if (!Number.isInteger(baseAhead) || !Number.isInteger(branchAhead)) return null;
  return { baseAhead, branchAhead };
}

export async function getAheadBehindBase(root: string, base: string): Promise<AheadBehind | null> {
  try {
    const { stdout } = await runCommand("git", ["rev-list", "--left-right", "--count", `origin/${base}...HEAD`], { cwd: root });
    return parseAheadBehind(stdout);
  } catch {
    return null;
  }
}

export function slugifyBranchTitle(title: string): string {
  const slug = title
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .replace(/-{2,}/g, "-")
    .slice(0, 48)
    .replace(/-+$/g, "");
  return slug || "code-changes";
}

export function generatedBranchName(title: string): string {
  return `feature/${slugifyBranchTitle(title)}`;
}

export function validateBranchName(branch: string): string {
  const trimmed = branch.trim();
  if (!trimmed) throw new DeliverError("Branch name cannot be empty.");
  if (trimmed.startsWith("-") || trimmed.includes("..") || trimmed.includes("//") || /[\s~^:?*[\\]/.test(trimmed)) {
    throw new DeliverError(`Unsafe branch name: ${branch}`);
  }
  return trimmed;
}

export function buildBranchPlan(input: {
  repo: RepoContext;
  title: string;
  requestedBranch?: string;
  forceFresh?: boolean;
  forceCurrent?: boolean;
  aheadBehind?: AheadBehind | null;
}): BranchPlan {
  const requestedBranch = input.requestedBranch ? validateBranchName(input.requestedBranch) : undefined;
  if (input.forceCurrent && (input.forceFresh || requestedBranch)) {
    throw new DeliverError("Use either --current-branch or --new-branch/--branch, not both.");
  }

  const freshBranch = requestedBranch ?? generatedBranchName(input.title);
  if (input.forceFresh || requestedBranch) {
    return {
      mode: "fresh",
      branch: freshBranch,
      base: input.repo.base,
      fromBranch: input.repo.branch,
      reasons: ["fresh branch requested"],
    };
  }

  if (input.forceCurrent) {
    return { mode: "current", branch: input.repo.branch, reasons: ["current branch requested"] };
  }

  if (input.repo.branch === input.repo.base) {
    return {
      mode: "fresh",
      branch: freshBranch,
      base: input.repo.base,
      fromBranch: input.repo.branch,
      reasons: ["current branch is the base branch"],
    };
  }

  if (input.aheadBehind && input.aheadBehind.baseAhead > 0) {
    return {
      mode: "fresh",
      branch: freshBranch,
      base: input.repo.base,
      fromBranch: input.repo.branch,
      reasons: [`current branch is behind origin/${input.repo.base} by ${input.aheadBehind.baseAhead} commit(s)`],
    };
  }

  return { mode: "current", branch: input.repo.branch, reasons: ["current branch is usable"] };
}

export async function localBranchExists(root: string, branch: string): Promise<boolean> {
  try {
    await runCommand("git", ["show-ref", "--verify", "--quiet", `refs/heads/${branch}`], { cwd: root });
    return true;
  } catch {
    return false;
  }
}

export async function ensureAvailableBranchName(root: string, branch: string): Promise<string> {
  if (!(await localBranchExists(root, branch))) return branch;
  const suffix = new Date().toISOString().replace(/[-:TZ.]/g, "").slice(0, 14);
  return `${branch}-${suffix}`;
}

export function gitFetchBaseArgv(base: string): string[] {
  return ["fetch", "origin", base];
}

export function gitStashPushArgv(message: string): string[] {
  return ["stash", "push", "--include-untracked", "--message", message];
}

export function gitSwitchArgv(branch: string): string[] {
  return ["switch", branch];
}

export function gitPullFfOnlyArgv(base: string): string[] {
  return ["pull", "--ff-only", "origin", base];
}

export function gitSwitchCreateArgv(branch: string): string[] {
  return ["switch", "-c", branch];
}

export function gitStashPopArgv(): string[] {
  return ["stash", "pop"];
}

export async function prepareFreshBranch(root: string, plan: Extract<BranchPlan, { mode: "fresh" }>): Promise<void> {
  const stashMessage = `pi-deliver ${Date.now()} ${plan.branch}`;
  let stashed = false;
  try {
    await runCommand("git", gitFetchBaseArgv(plan.base), { cwd: root, timeout: 60_000 });
    await runCommand("git", gitStashPushArgv(stashMessage), { cwd: root });
    stashed = true;
    await runCommand("git", gitSwitchArgv(plan.base), { cwd: root });
    await runCommand("git", gitPullFfOnlyArgv(plan.base), { cwd: root, timeout: 60_000 });
    await runCommand("git", gitSwitchCreateArgv(plan.branch), { cwd: root });
    await runCommand("git", gitStashPopArgv(), { cwd: root });
    stashed = false;
  } catch (error: any) {
    const recovery = stashed
      ? " Local changes were stashed before the failure; inspect `git stash list` and recover with `git stash pop` after resolving the branch state."
      : "";
    throw new DeliverError(`Could not prepare delivery branch.${recovery} ${error.message}`.trim());
  }
}

export function gitAddAllArgv(): string[] {
  return ["add", "-A"];
}

export function gitAddPathsArgv(paths: string[]): string[] {
  return ["add", "-A", "--", ...paths];
}

export function gitCommitArgv(title: string, body?: string): string[] {
  const args = ["commit", "-m", title];
  if (body?.trim()) args.push("-m", body.trim());
  return args;
}

export function gitPushCurrentBranchArgv(): string[] {
  return ["push", "-u", "origin", "HEAD"];
}

export async function stageAll(root: string): Promise<void> {
  await runCommand("git", gitAddAllArgv(), { cwd: root });
}

export async function stagePaths(root: string, paths: string[]): Promise<void> {
  if (paths.length === 0) throw new DeliverError("No paths selected for staging.");
  await runCommand("git", gitAddPathsArgv(paths), { cwd: root });
}

export async function commitChanges(root: string, title: string, body?: string): Promise<string> {
  await runCommand("git", gitCommitArgv(title, body), { cwd: root });
  const { stdout } = await runCommand("git", ["rev-parse", "HEAD"], { cwd: root });
  return stdout.trim();
}

export async function pushCurrentBranch(root: string): Promise<void> {
  await runCommand("git", gitPushCurrentBranchArgv(), { cwd: root });
}
