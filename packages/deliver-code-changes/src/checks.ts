import { access, readFile } from "node:fs/promises";
import path from "node:path";
import { runCommand } from "./output.ts";

export type DocsPolicy = "off" | "warn" | "stop";

export type CheckSpec = {
  name: string;
  command: string;
  args: string[];
};

export type DeliverConfig = {
  checks?: CheckSpec[];
  base?: string;
  prDraft: boolean;
  docsPolicy: DocsPolicy;
};

const DOCS_POLICIES = new Set(["off", "warn", "stop"]);

async function exists(filePath: string): Promise<boolean> {
  try {
    await access(filePath);
    return true;
  } catch {
    return false;
  }
}

function stripJsonComments(text: string): string {
  let out = "";
  let inString = false;
  let escaped = false;
  for (let index = 0; index < text.length; index += 1) {
    const char = text[index];
    const next = text[index + 1];

    if (inString) {
      out += char;
      if (escaped) {
        escaped = false;
      } else if (char === "\\") {
        escaped = true;
      } else if (char === '"') {
        inString = false;
      }
      continue;
    }

    if (char === '"') {
      inString = true;
      out += char;
      continue;
    }

    if (char === "/" && next === "/") {
      while (index < text.length && text[index] !== "\n") index += 1;
      out += "\n";
      continue;
    }

    if (char === "/" && next === "*") {
      index += 2;
      while (index < text.length && !(text[index] === "*" && text[index + 1] === "/")) index += 1;
      index += 1;
      continue;
    }

    out += char;
  }
  return out;
}

function stripJsonTrailingCommas(text: string): string {
  let out = "";
  let inString = false;
  let escaped = false;
  for (let index = 0; index < text.length; index += 1) {
    const char = text[index];

    if (inString) {
      out += char;
      if (escaped) {
        escaped = false;
      } else if (char === "\\") {
        escaped = true;
      } else if (char === '"') {
        inString = false;
      }
      continue;
    }

    if (char === '"') {
      inString = true;
      out += char;
      continue;
    }

    if (char === ",") {
      let nextIndex = index + 1;
      while (/\s/.test(text[nextIndex] ?? "")) nextIndex += 1;
      if (text[nextIndex] === "}" || text[nextIndex] === "]") continue;
    }

    out += char;
  }
  return out;
}

function parseJsonc(text: string): unknown {
  return JSON.parse(stripJsonTrailingCommas(stripJsonComments(text)));
}

export function isBareExecutable(command: unknown): command is string {
  return typeof command === "string"
    && command.trim() === command
    && command.length > 0
    && !/[\\/\s]/.test(command);
}

function validateCheck(value: unknown, index: number): CheckSpec {
  if (!value || typeof value !== "object") {
    throw new Error(`.pi/deliver.json checks[${index}] must be an object`);
  }
  const record = value as Record<string, unknown>;
  if (typeof record.name !== "string" || !record.name.trim()) {
    throw new Error(`.pi/deliver.json checks[${index}].name must be a non-empty string`);
  }
  if (!isBareExecutable(record.command)) {
    throw new Error(`.pi/deliver.json checks[${index}].command must be a bare executable name`);
  }
  if (record.args != null && (!Array.isArray(record.args) || record.args.some((arg) => typeof arg !== "string"))) {
    throw new Error(`.pi/deliver.json checks[${index}].args must be an array of strings`);
  }
  return {
    name: record.name.trim(),
    command: record.command,
    args: record.args ? [...record.args] as string[] : [],
  };
}

export function validateDeliverConfig(value: unknown): DeliverConfig {
  if (value == null) {
    return { prDraft: false, docsPolicy: "warn" };
  }
  if (typeof value !== "object" || Array.isArray(value)) {
    throw new Error(".pi/deliver.json must contain an object");
  }
  const record = value as Record<string, unknown>;
  const config: DeliverConfig = { prDraft: false, docsPolicy: "warn" };

  if (record.checks != null) {
    if (!Array.isArray(record.checks)) {
      throw new Error(".pi/deliver.json checks must be an array");
    }
    config.checks = record.checks.map(validateCheck);
  }
  if (record.base != null) {
    if (typeof record.base !== "string" || !record.base.trim()) {
      throw new Error(".pi/deliver.json base must be a non-empty string");
    }
    config.base = record.base.trim();
  }
  if (record.prDraft != null) {
    if (typeof record.prDraft !== "boolean") {
      throw new Error(".pi/deliver.json prDraft must be boolean");
    }
    config.prDraft = record.prDraft;
  }
  if (record.docsPolicy != null) {
    if (typeof record.docsPolicy !== "string" || !DOCS_POLICIES.has(record.docsPolicy)) {
      throw new Error(".pi/deliver.json docsPolicy must be off, warn, or stop");
    }
    config.docsPolicy = record.docsPolicy as DocsPolicy;
  }

  return config;
}

export async function loadDeliverConfig(root: string): Promise<DeliverConfig> {
  const configPath = path.join(root, ".pi", "deliver.json");
  if (!(await exists(configPath))) return validateDeliverConfig(null);

  const text = await readFile(configPath, "utf-8");
  try {
    return validateDeliverConfig(parseJsonc(text));
  } catch (error: any) {
    throw new Error(`Invalid .pi/deliver.json: ${error.message}`);
  }
}

export async function isCommandAvailable(command: string, cwd: string): Promise<boolean> {
  try {
    await runCommand(command, ["--version"], { cwd, timeout: 5000 });
    return true;
  } catch {
    return false;
  }
}

export async function detectChecks(
  root: string,
  config: DeliverConfig,
  options: { prekAvailable?: boolean } = {},
): Promise<CheckSpec[]> {
  if (config.checks && config.checks.length > 0) {
    return config.checks;
  }

  const checks: CheckSpec[] = [];
  const packageJsonPath = path.join(root, "package.json");
  if (await exists(packageJsonPath)) {
    const pkg = JSON.parse(await readFile(packageJsonPath, "utf-8"));
    const scripts = pkg && typeof pkg === "object" ? pkg.scripts as Record<string, unknown> | undefined : undefined;
    if (scripts && typeof scripts.check === "string") {
      checks.push({ name: "check", command: "npm", args: ["run", "check"] });
    }
    if (scripts && typeof scripts.test === "string") {
      checks.push({ name: "test", command: "npm", args: ["test"] });
    }
  }

  const hasPreCommitConfig = await exists(path.join(root, ".pre-commit-config.yaml"))
    || await exists(path.join(root, ".pre-commit-config.yml"));
  const prekAvailable = options.prekAvailable ?? await isCommandAvailable("prek", root);
  if (hasPreCommitConfig && prekAvailable) {
    checks.push({ name: "prek", command: "prek", args: ["run", "--all-files"] });
  }

  return checks;
}
