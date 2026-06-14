import { execFile } from "node:child_process";
import { promisify } from "node:util";
import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";
import { Type } from "typebox";

const execFileAsync = promisify(execFile);

// =============================================================================
// Constants
// =============================================================================

const EXEC_TIMEOUT = 5_000; // 5 seconds

// =============================================================================
// Helpers
// =============================================================================

/**
 * Run zed with the given arguments. Returns { stdout, stderr } or throws a
 * sanitized error.
 */
async function runZed(args: string[]): Promise<{ stdout: string; stderr: string }> {
  try {
    const { stdout, stderr } = await execFileAsync("zed", args, {
      encoding: "utf-8",
      timeout: EXEC_TIMEOUT,
      env: {
        HOME: process.env.HOME ?? "",
        PATH: process.env.PATH ?? "",
      },
    });
    return { stdout, stderr };
  } catch (error: any) {
    const label = `zed ${args.join(" ")}`;
    if (error.code === "ETIMEDOUT") {
      throw new Error(`${label} timed out after ${EXEC_TIMEOUT}ms`);
    }
    if (error.code === "ENOENT") {
      throw new Error(
        `zed command not found. Install Zed IDE and ensure it is on PATH.`,
      );
    }
    throw new Error(`${label} failed (exit ${error.code ?? error.status ?? "unknown"})`);
  }
}

// =============================================================================
// Tool handler
// =============================================================================

const OPEN_ZED_SCHEMA = Type.Object({
  path: Type.String({ description: "Path to the file to open in Zed IDE" }),
  line: Type.Optional(Type.Number({ description: "Line number to navigate to (1-indexed)" })),
});

async function handleOpenZed(
  _toolCallId: string,
  params: { path: string; line?: number },
): Promise<{ content: { type: "text"; text: string }[] }> {
  if (!params.path?.trim()) {
    throw new Error("path is required.");
  }

  const target = params.line != null ? `${params.path}:${params.line}` : params.path;

  await runZed([target]);

  const detail = params.line != null
    ? `Opened ${params.path} at line ${params.line} in Zed.`
    : `Opened ${params.path} in Zed.`;

  return { content: [{ type: "text", text: detail }] };
}

// =============================================================================
// Extension entry point
// =============================================================================

export default function openZed(pi: ExtensionAPI) {
  pi.registerTool({
    name: "open_zed",
    label: "Open in Zed",
    description:
      "Opens a file in the Zed IDE on the host machine. Optionally at a specific line number.",
    promptSnippet: "Open a file in the Zed IDE at an optional line number",
    promptGuidelines: [
      "Use open_zed when the user asks to open or edit a file in their Zed IDE.",
    ],
    parameters: OPEN_ZED_SCHEMA,
    async execute(toolCallId, params, _signal, _onUpdate, _ctx) {
      return handleOpenZed(toolCallId, params as { path: string; line?: number });
    },
  });
}
