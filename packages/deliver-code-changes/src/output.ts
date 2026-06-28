import { execFile } from "node:child_process";
import { promisify } from "node:util";

const execFileAsync = promisify(execFile);

const DEFAULT_TIMEOUT = 30_000;
const CHECK_TIMEOUT = 10 * 60_000;
const MAX_BUFFER = 4 * 1024 * 1024;
const MAX_OUTPUT_CHARS = 4000;
const MAX_ERROR_CHARS = 1200;

export type ExecResult = { stdout: string; stderr: string };

export class DeliverError extends Error {
  constructor(message: string, readonly details?: unknown) {
    super(message);
    this.name = "DeliverError";
  }
}

export function truncate(text: string | undefined, maxChars = MAX_OUTPUT_CHARS): string {
  if (!text) return "";
  const trimmed = text.trim();
  if (trimmed.length <= maxChars) return trimmed;
  return `${trimmed.slice(0, maxChars)}... [truncated]`;
}

export function sanitizeOutput(text: string | undefined): string {
  if (!text) return "";
  let sanitized = text;
  sanitized = sanitized.replace(/\bgh[pousr]_[A-Za-z0-9_]+\b/g, "[redacted-token]");
  sanitized = sanitized.replace(/\bgithub_pat_[A-Za-z0-9_]+\b/g, "[redacted-token]");
  sanitized = sanitized.replace(/\b[A-Za-z0-9_+=/-]{32,}\b/g, (value) => {
    if (/^(?:[a-f0-9]{40}|[a-f0-9]{64})$/i.test(value)) return value;
    return "[redacted-token-like-value]";
  });
  if (process.env.HOME) {
    sanitized = sanitized.replaceAll(process.env.HOME, "~");
  }
  return sanitized;
}

function commandLabel(command: string, args: string[]): string {
  return [command, ...args.slice(0, 4)].join(" ");
}

export async function runCommand(
  command: string,
  args: string[],
  options: { cwd: string; timeout?: number } = { cwd: process.cwd() },
): Promise<ExecResult> {
  const timeout = options.timeout ?? DEFAULT_TIMEOUT;
  try {
    const { stdout, stderr } = await execFileAsync(command, args, {
      cwd: options.cwd,
      encoding: "utf-8",
      maxBuffer: MAX_BUFFER,
      timeout,
      env: {
        HOME: process.env.HOME ?? "",
        PATH: process.env.PATH ?? "",
        ...(process.env.SSH_AUTH_SOCK ? { SSH_AUTH_SOCK: process.env.SSH_AUTH_SOCK } : {}),
        ...(process.env.GH_CONFIG_DIR ? { GH_CONFIG_DIR: process.env.GH_CONFIG_DIR } : {}),
        ...(process.env.XDG_CONFIG_HOME ? { XDG_CONFIG_HOME: process.env.XDG_CONFIG_HOME } : {}),
      },
    });
    return { stdout, stderr };
  } catch (error: any) {
    const label = commandLabel(command, args);
    if (error.code === "ETIMEDOUT") {
      throw new DeliverError(`${label} timed out after ${timeout}ms`);
    }
    const stderr = truncate(sanitizeOutput(error.stderr), MAX_ERROR_CHARS);
    const stdout = truncate(sanitizeOutput(error.stdout), MAX_ERROR_CHARS);
    const suffix = stderr || stdout ? `: ${stderr || stdout}` : "";
    throw new DeliverError(`${label} failed${suffix}`);
  }
}

export async function runCheckCommand(
  command: string,
  args: string[],
  cwd: string,
): Promise<ExecResult> {
  return runCommand(command, args, { cwd, timeout: CHECK_TIMEOUT });
}

export function formatCommand(command: string, args: string[] = []): string {
  return [command, ...args].join(" ");
}
