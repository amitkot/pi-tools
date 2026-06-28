import { DeliverError, runCommand } from "./output.ts";

export type CreatePrOptions = {
  base: string;
  title: string;
  body: string;
  draft?: boolean;
};

export type ExistingPr = {
  number?: number;
  url?: string;
  title?: string;
  state?: string;
};

export function ghAuthStatusArgv(): string[] {
  return ["auth", "status"];
}

export function ghCurrentPrViewArgv(): string[] {
  return ["pr", "view", "--json", "number,url,title,state"];
}

export function ghCreatePrArgv(options: CreatePrOptions): string[] {
  const args = ["pr", "create", "--base", options.base, "--title", options.title, "--body", options.body];
  if (options.draft) args.push("--draft");
  return args;
}

export async function assertGhAuthenticated(root: string): Promise<void> {
  await runCommand("gh", ghAuthStatusArgv(), { cwd: root });
}

export async function getExistingPr(root: string): Promise<ExistingPr | null> {
  try {
    const { stdout } = await runCommand("gh", ghCurrentPrViewArgv(), { cwd: root });
    const pr = JSON.parse(stdout) as ExistingPr;
    if (pr && pr.url && pr.state === "OPEN") return pr;
    return null;
  } catch {
    return null;
  }
}

export async function createPr(root: string, options: CreatePrOptions): Promise<string> {
  const { stdout } = await runCommand("gh", ghCreatePrArgv(options), { cwd: root, timeout: 60_000 });
  const url = stdout.trim().split(/\s+/).find((part) => /^https?:\/\//.test(part));
  if (!url) {
    throw new DeliverError("gh pr create completed but no PR URL was found in the output.");
  }
  return url;
}
