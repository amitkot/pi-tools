import { access } from "node:fs/promises";
import path from "node:path";
import type { DocsPolicy } from "./checks.ts";
import type { StatusFile } from "./git.ts";
import { DeliverError } from "./output.ts";

export type PolicyFindings = {
  blocks: string[];
  warnings: string[];
};

async function exists(filePath: string): Promise<boolean> {
  try {
    await access(filePath);
    return true;
  } catch {
    return false;
  }
}

function normalizePath(filePath: string): string {
  return filePath.replaceAll("\\", "/").replace(/^\.\//, "");
}

function isEnvExample(filePath: string): boolean {
  const base = path.posix.basename(filePath);
  return base === ".env.example" || base === ".env.sample" || base === ".env.template";
}

export function isSecretLikePath(filePath: string): boolean {
  const normalized = normalizePath(filePath);
  const base = path.posix.basename(normalized);

  if (base === ".env" || (base.startsWith(".env.") && !isEnvExample(normalized))) return true;
  if (base === ".npmrc" || base === ".netrc") return true;
  if (normalized === ".ssh" || normalized.startsWith(".ssh/") || normalized.includes("/.ssh/")) return true;
  if (/^id_(rsa|dsa|ecdsa|ed25519)(\.pub)?$/.test(base) && !base.endsWith(".pub")) return true;
  if (/private[-_]?key/i.test(base)) return true;
  if (/\.(pem|p12|pfx|key)$/i.test(base)) return true;

  return false;
}

function hasChanged(paths: string[], predicate: (filePath: string) => boolean): boolean {
  return paths.some((filePath) => predicate(normalizePath(filePath)));
}

function isDocsPath(filePath: string): boolean {
  return filePath === "README.md"
    || filePath.endsWith("/README.md")
    || filePath === "SECURITY.md"
    || filePath.startsWith("docs/");
}

function isSourceOrPackagePath(filePath: string): boolean {
  return filePath.startsWith("src/")
    || filePath.startsWith("packages/")
    || filePath.startsWith("scripts/")
    || filePath.startsWith("tests/")
    || filePath === "package.json"
    || filePath.endsWith("/package.json");
}

function isConfigOrCodePath(filePath: string): boolean {
  return isSourceOrPackagePath(filePath)
    || filePath.endsWith(".ts")
    || filePath.endsWith(".js")
    || filePath.endsWith(".mjs")
    || filePath.endsWith(".json")
    || filePath.endsWith(".yaml")
    || filePath.endsWith(".yml");
}

function isPublicSurfacePath(filePath: string): boolean {
  return filePath.endsWith("package.json")
    || filePath.includes("/src/index.ts")
    || filePath === "src/index.ts"
    || filePath.includes("/skills/")
    || filePath.includes("/commands/")
    || filePath.includes("/cli/");
}

export async function collectPolicyFindings(
  root: string,
  files: Array<StatusFile | string>,
  docsPolicy: DocsPolicy = "warn",
): Promise<PolicyFindings> {
  const changedPaths = files.map((file) => normalizePath(typeof file === "string" ? file : file.path));
  const findings: PolicyFindings = { blocks: [], warnings: [] };

  for (const filePath of changedPaths) {
    if (isSecretLikePath(filePath)) {
      findings.blocks.push(`Refusing to stage likely secret-bearing file: ${filePath}`);
    }
  }

  if (docsPolicy === "off") return findings;

  const envExampleExists = await exists(path.join(root, ".env.example"));
  if (envExampleExists
    && hasChanged(changedPaths, isConfigOrCodePath)
    && !changedPaths.includes(".env.example")) {
    findings.warnings.push(".env.example exists but was not changed; confirm no new environment variables or config examples are needed.");
  }

  const changelogExists = await exists(path.join(root, "CHANGELOG.md"));
  if (changelogExists
    && hasChanged(changedPaths, isSourceOrPackagePath)
    && !changedPaths.includes("CHANGELOG.md")) {
    findings.warnings.push("CHANGELOG.md exists but was not changed; confirm no package or public behavior note is needed.");
  }

  const docsExist = await exists(path.join(root, "README.md")) || await exists(path.join(root, "docs"));
  if (docsExist
    && hasChanged(changedPaths, isPublicSurfacePath)
    && !hasChanged(changedPaths, isDocsPath)) {
    findings.warnings.push("Public package, command, skill, or CLI surface changed without docs changes.");
  }

  return findings;
}

export function assertPolicyAllows(findings: PolicyFindings, docsPolicy: DocsPolicy): void {
  if (findings.blocks.length > 0) {
    throw new DeliverError(findings.blocks.join("\n"));
  }
  if (docsPolicy === "stop" && findings.warnings.length > 0) {
    throw new DeliverError(findings.warnings.join("\n"));
  }
}
