import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";
import { detectChecks, loadDeliverConfig, type CheckSpec } from "./checks.ts";
import { assertPolicyAllows, collectPolicyFindings, type PolicyFindings } from "./docs-policy.ts";
import {
  buildBranchPlan,
  commitChanges,
  ensureAvailableBranchName,
  getAheadBehindBase,
  getGitRoot,
  getRepoContext,
  getStatus,
  prepareFreshBranch,
  pushCurrentBranch,
  stageAll,
  stagePaths,
  type BranchPlan,
  type RepoContext,
  type StatusFile,
} from "./git.ts";
import { formatCommand, runCheckCommand, truncate } from "./output.ts";
import { assertGhAuthenticated, createPr, getExistingPr } from "./pr.ts";

export { detectChecks, loadDeliverConfig, validateDeliverConfig, isBareExecutable } from "./checks.ts";
export { collectPolicyFindings, assertPolicyAllows, isSecretLikePath } from "./docs-policy.ts";
export {
  buildBranchPlan,
  generatedBranchName,
  gitAddAllArgv,
  gitAddPathsArgv,
  gitCommitArgv,
  gitFetchBaseArgv,
  gitPullFfOnlyArgv,
  gitPushCurrentBranchArgv,
  gitStashPopArgv,
  gitStashPushArgv,
  gitSwitchArgv,
  gitSwitchCreateArgv,
  parseAheadBehind,
  parseDefaultBranch,
  parseStatusPorcelainZ,
  slugifyBranchTitle,
} from "./git.ts";
export { ghAuthStatusArgv, ghCreatePrArgv, ghCurrentPrViewArgv } from "./pr.ts";

function fileLines(files: StatusFile[], limit = 25): string[] {
  const shown = files.slice(0, limit).map((file) => `- ${file.path}`);
  if (files.length > limit) shown.push(`- ...and ${files.length - limit} more`);
  return shown;
}

function normalizePath(filePath: string): string {
  return filePath.replaceAll("\\", "/").replace(/^\.\//, "");
}

function addToolPath(paths: Set<string>, name: string, args: any): void {
  if ((name === "write" || name === "edit") && typeof args?.path === "string") {
    paths.add(normalizePath(args.path));
  }
  if (name === "multi_tool_use.parallel" && Array.isArray(args?.tool_uses)) {
    for (const toolUse of args.tool_uses) {
      const childName = String(toolUse?.recipient_name ?? "").split(".").pop() ?? "";
      addToolPath(paths, childName, toolUse?.parameters);
    }
  }
}

export function extractSessionTouchedPaths(entries: any[]): string[] {
  const paths = new Set<string>();
  for (const entry of entries) {
    const message = entry?.message;
    if (entry?.type !== "message" || message?.role !== "assistant" || !Array.isArray(message.content)) continue;
    for (const block of message.content) {
      if (block?.type === "toolCall") {
        addToolPath(paths, block.name, block.arguments);
      }
    }
  }
  return [...paths].sort();
}

function expandCompanionPaths(paths: string[], changedPaths: string[]): string[] {
  const selected = new Set(paths.map(normalizePath));
  const changed = new Set(changedPaths.map(normalizePath));
  for (const filePath of [...selected]) {
    if (filePath === "package.json" && changed.has("package-lock.json")) {
      selected.add("package-lock.json");
    }
    if (filePath.endsWith("/package.json")) {
      const lockPath = `${filePath.slice(0, -"package.json".length)}package-lock.json`;
      if (changed.has(lockPath)) selected.add(lockPath);
    }
  }
  return [...selected].sort();
}

function pathMatches(filePath: string, selector: string): boolean {
  const normalizedFile = normalizePath(filePath);
  const normalizedSelector = normalizePath(selector).replace(/\/$/, "");
  return normalizedFile === normalizedSelector || normalizedFile.startsWith(`${normalizedSelector}/`);
}

export function selectDeliveryFiles(input: {
  changedFiles: StatusFile[];
  sessionTouchedPaths: string[];
  includePaths?: string[];
  excludePaths?: string[];
  all?: boolean;
}): { selected: StatusFile[]; excluded: StatusFile[]; source: string } {
  const includePaths = input.includePaths ?? [];
  const excludePaths = input.excludePaths ?? [];
  const changedPaths = input.changedFiles.map((file) => file.path);
  let selectors: string[];
  let source: string;

  if (input.all) {
    selectors = changedPaths;
    source = "all changed files";
  } else if (includePaths.length > 0) {
    selectors = includePaths;
    source = "explicit --include paths";
  } else {
    selectors = expandCompanionPaths(input.sessionTouchedPaths, changedPaths);
    source = "files touched by this Pi session";
  }

  const selected = input.changedFiles.filter((file) => selectors.some((selector) => pathMatches(file.path, selector)));
  const afterExclude = selected.filter((file) => !excludePaths.some((selector) => pathMatches(file.path, selector)));
  const excluded = input.changedFiles.filter((file) => !afterExclude.some((selectedFile) => selectedFile.path === file.path));
  return { selected: afterExclude, excluded, source };
}

function buildPrBody(files: StatusFile[], checks: CheckSpec[], findings: PolicyFindings): string {
  const lines = [
    "## Summary",
    "",
    "Delivered local code changes with `/deliver`.",
    "",
    "## Changed files",
    "",
    ...fileLines(files, 40),
    "",
    "## Verification",
    "",
    ...checks.map((check) => `- ${formatCommand(check.command, check.args)}`),
  ];

  if (findings.warnings.length > 0) {
    lines.push("", "## Delivery warnings", "", ...findings.warnings.map((warning) => `- ${warning}`));
  }

  return lines.join("\n");
}

function buildCommitBody(files: StatusFile[], checks: CheckSpec[], findings: PolicyFindings): string {
  const lines = [
    `Changed files: ${files.length}`,
    `Checks: ${checks.map((check) => check.name).join(", ")}`,
  ];
  if (findings.warnings.length > 0) {
    lines.push("Warnings:", ...findings.warnings.map((warning) => `- ${warning}`));
  }
  return lines.join("\n");
}

function buildConfirmationSummary(input: {
  repo: RepoContext;
  branchPlan: BranchPlan;
  files: StatusFile[];
  excludedFiles: StatusFile[];
  fileSource: string;
  checks: CheckSpec[];
  findings: PolicyFindings;
  title: string;
  draft: boolean;
}): string {
  const warningLines = input.findings.warnings.length > 0
    ? ["", "Warnings:", ...input.findings.warnings.map((warning) => `- ${warning}`)]
    : [];

  const branchLines = input.branchPlan.mode === "fresh"
    ? [
      `Current branch: ${input.branchPlan.fromBranch}`,
      `Delivery branch: ${input.branchPlan.branch}`,
      `Base: ${input.branchPlan.base}`,
      "Branch preparation: stash local changes, fetch/pull base, create delivery branch, pop stash",
      `Reason: ${input.branchPlan.reasons.join("; ")}`,
    ]
    : [
      `Delivery branch: ${input.branchPlan.branch}`,
      `Base: ${input.repo.base}`,
      `Reason: ${input.branchPlan.reasons.join("; ")}`,
    ];

  const excludedLines = input.excludedFiles.length > 0
    ? ["", `Excluded changed files (${input.excludedFiles.length}, not staged):`, ...fileLines(input.excludedFiles)]
    : [];

  return [
    `Repository: ${input.repo.root}`,
    ...branchLines,
    `Commit/PR title: ${input.title}`,
    `PR draft: ${input.draft ? "yes" : "no"}`,
    `File scope: ${input.fileSource}`,
    "",
    `Selected changed files (${input.files.length}):`,
    ...fileLines(input.files),
    ...excludedLines,
    "",
    "Checks to run:",
    ...input.checks.map((check) => `- ${check.name}: ${formatCommand(check.command, check.args)}`),
    ...warningLines,
    "",
    "If confirmed, /deliver will prepare the branch if needed, run checks, stage all changes, commit, push origin HEAD, and create a GitHub PR.",
  ].join("\n");
}

type DeliverArgs = {
  title: string;
  forceFresh: boolean;
  forceCurrent: boolean;
  all: boolean;
  branch?: string;
  includePaths: string[];
  excludePaths: string[];
};

function parseDeliverArgs(args: string): DeliverArgs {
  const tokens = args.trim().split(/\s+/).filter(Boolean);
  const titleParts: string[] = [];
  let forceFresh = false;
  let forceCurrent = false;
  let all = false;
  let branch: string | undefined;
  const includePaths: string[] = [];
  const excludePaths: string[] = [];

  for (let index = 0; index < tokens.length; index += 1) {
    const token = tokens[index];
    if (token === "--new-branch") {
      forceFresh = true;
      continue;
    }
    if (token === "--current-branch") {
      forceCurrent = true;
      continue;
    }
    if (token === "--branch") {
      branch = tokens[index + 1];
      index += 1;
      continue;
    }
    if (token === "--all") {
      all = true;
      continue;
    }
    if (token === "--include" || token === "--path") {
      if (tokens[index + 1]) includePaths.push(tokens[index + 1]);
      index += 1;
      continue;
    }
    if (token === "--exclude") {
      if (tokens[index + 1]) excludePaths.push(tokens[index + 1]);
      index += 1;
      continue;
    }
    titleParts.push(token);
  }

  return { title: titleParts.join(" "), forceFresh, forceCurrent, all, branch, includePaths, excludePaths };
}

async function askForTitle(parsedArgs: DeliverArgs, ctx: any): Promise<string | null> {
  if (parsedArgs.title) return parsedArgs.title;
  const title = await ctx.ui.input("Commit and PR title:", "Deliver code changes");
  if (typeof title !== "string" || !title.trim()) return null;
  return title.trim();
}

async function runChecks(root: string, checks: CheckSpec[], ctx: any): Promise<void> {
  for (const check of checks) {
    ctx.ui.setStatus?.("deliver", `Running ${check.name}`);
    ctx.ui.notify?.(`Running ${check.name}: ${formatCommand(check.command, check.args)}`, "info");
    const result = await runCheckCommand(check.command, check.args, root);
    const output = truncate(`${result.stdout}\n${result.stderr}`);
    if (output) {
      ctx.ui.notify?.(`${check.name} passed:\n${output}`, "info");
    } else {
      ctx.ui.notify?.(`${check.name} passed`, "info");
    }
  }
}

async function handleDeliver(args: string, ctx: any): Promise<void> {
  await ctx.waitForIdle?.();

  if (ctx.hasUI === false) {
    throw new Error("/deliver requires an interactive UI for the confirmation gate.");
  }

  const parsedArgs = parseDeliverArgs(args);
  const title = await askForTitle(parsedArgs, ctx);
  if (!title) {
    ctx.ui.notify("Delivery cancelled: no commit/PR title provided.", "warning");
    return;
  }

  const root = await getGitRoot(ctx.cwd);
  const config = await loadDeliverConfig(root);
  const repo = await getRepoContext(root, config.base);
  const files = await getStatus(repo.root);
  if (files.length === 0) {
    ctx.ui.notify("No local changes to deliver.", "info");
    return;
  }

  const sessionTouchedPaths = extractSessionTouchedPaths(ctx.sessionManager?.getBranch?.() ?? ctx.sessionManager?.getEntries?.() ?? []);
  const fileSelection = selectDeliveryFiles({
    changedFiles: files,
    sessionTouchedPaths,
    includePaths: parsedArgs.includePaths,
    excludePaths: parsedArgs.excludePaths,
    all: parsedArgs.all,
  });
  if (fileSelection.selected.length === 0) {
    throw new Error("No changed files matched the delivery scope. Use --all or --include <path> to select files explicitly.");
  }

  const aheadBehind = await getAheadBehindBase(repo.root, repo.base);
  let branchPlan = buildBranchPlan({
    repo,
    title,
    requestedBranch: parsedArgs.branch,
    forceFresh: parsedArgs.forceFresh,
    forceCurrent: parsedArgs.forceCurrent,
    aheadBehind,
  });
  if (branchPlan.mode === "fresh") {
    branchPlan = {
      ...branchPlan,
      branch: await ensureAvailableBranchName(repo.root, branchPlan.branch),
    };
  }

  const checks = await detectChecks(repo.root, config);
  if (checks.length === 0) {
    throw new Error("No checks were configured or detected. Add .pi/deliver.json before using /deliver.");
  }

  const allFileFindings = await collectPolicyFindings(repo.root, files, "off");
  assertPolicyAllows(allFileFindings, "off");
  const findings = await collectPolicyFindings(repo.root, fileSelection.selected, config.docsPolicy);
  assertPolicyAllows(findings, config.docsPolicy);

  await assertGhAuthenticated(repo.root);
  if (branchPlan.mode === "current") {
    const existingPr = await getExistingPr(repo.root);
    if (existingPr?.url) {
      throw new Error(`An open PR already exists for this branch: ${existingPr.url}`);
    }
  }

  const confirmed = await ctx.ui.confirm(
    "Deliver code changes?",
    buildConfirmationSummary({
      repo,
      branchPlan,
      files: fileSelection.selected,
      excludedFiles: fileSelection.excluded,
      fileSource: fileSelection.source,
      checks,
      findings,
      title,
      draft: config.prDraft,
    }),
  );
  if (!confirmed) {
    ctx.ui.notify("Delivery cancelled.", "warning");
    return;
  }

  if (branchPlan.mode === "fresh") {
    ctx.ui.setStatus?.("deliver", "Preparing delivery branch");
    ctx.ui.notify?.(`Preparing ${branchPlan.branch} from ${branchPlan.base}`, "info");
    await prepareFreshBranch(repo.root, branchPlan);
    const existingPr = await getExistingPr(repo.root);
    if (existingPr?.url) {
      throw new Error(`An open PR already exists for the delivery branch: ${existingPr.url}`);
    }
  }

  await runChecks(repo.root, checks, ctx);

  const latestFiles = await getStatus(repo.root);
  const latestSelection = selectDeliveryFiles({
    changedFiles: latestFiles,
    sessionTouchedPaths,
    includePaths: parsedArgs.includePaths,
    excludePaths: parsedArgs.excludePaths,
    all: parsedArgs.all,
  });
  if (latestSelection.selected.length === 0) {
    throw new Error("Checks completed, but there are no selected changes to commit.");
  }
  const latestAllFileFindings = await collectPolicyFindings(repo.root, latestFiles, "off");
  assertPolicyAllows(latestAllFileFindings, "off");
  const latestFindings = await collectPolicyFindings(repo.root, latestSelection.selected, config.docsPolicy);
  assertPolicyAllows(latestFindings, config.docsPolicy);

  const body = buildPrBody(latestSelection.selected, checks, latestFindings);
  const commitBody = buildCommitBody(latestSelection.selected, checks, latestFindings);

  ctx.ui.setStatus?.("deliver", "Staging selected changes");
  if (parsedArgs.all) {
    await stageAll(repo.root);
  } else {
    await stagePaths(repo.root, latestSelection.selected.map((file) => file.path));
  }

  ctx.ui.setStatus?.("deliver", "Committing changes");
  const commitSha = await commitChanges(repo.root, title, commitBody);

  ctx.ui.setStatus?.("deliver", "Pushing branch");
  await pushCurrentBranch(repo.root);

  ctx.ui.setStatus?.("deliver", "Creating PR");
  const prUrl = await createPr(repo.root, {
    base: repo.base,
    title,
    body,
    draft: config.prDraft,
  });

  ctx.ui.setStatus?.("deliver", "Delivered");
  ctx.ui.notify(`Delivered ${commitSha.slice(0, 12)}: ${prUrl}`, "info");
}

export default function deliverCodeChanges(pi: ExtensionAPI) {
  pi.registerCommand("deliver", {
    description: "Run final checks, commit changes, and open a PR with one approval gate",
    handler: async (args, ctx) => {
      try {
        await handleDeliver(args ?? "", ctx);
      } catch (error: any) {
        ctx.ui.setStatus?.("deliver", "Failed");
        ctx.ui.notify(`Delivery stopped: ${error.message}`, "error");
      }
    },
  });
}
