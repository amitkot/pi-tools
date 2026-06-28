import assert from "node:assert/strict";
import { mkdtemp, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { createJiti } from "jiti";

const jiti = createJiti(import.meta.url);
const mod = jiti("../packages/precommit-setup/src/index.ts");

const {
  default: precommitSetup,
  buildPrecommitConfig,
  detectProfiles,
  parseAddPrecommitArgs,
} = mod;

function test(name, fn) {
  try {
    const result = fn();
    if (result && typeof result.then === "function") {
      return result.then(
        () => console.log(`ok - ${name}`),
        (error) => {
          console.error(`not ok - ${name}`);
          throw error;
        },
      );
    }
    console.log(`ok - ${name}`);
  } catch (error) {
    console.error(`not ok - ${name}`);
    throw error;
  }
}

async function tempDir() {
  return mkdtemp(path.join(os.tmpdir(), "pi-precommit-test-"));
}

await test("parseAddPrecommitArgs accepts profiles and flags", () => {
  assert.deepEqual(parseAddPrecommitArgs("rust python --no-install --force rust"), {
    profiles: ["rust", "python"],
    install: false,
    overwrite: true,
    help: false,
  });
  assert.deepEqual(parseAddPrecommitArgs("--help"), {
    profiles: [],
    install: true,
    overwrite: false,
    help: true,
  });
});

await test("parseAddPrecommitArgs rejects unknown arguments", () => {
  assert.throws(() => parseAddPrecommitArgs("go"), /Unknown/);
});

await test("detectProfiles finds Rust and Python project markers", async () => {
  const root = await tempDir();
  await writeFile(path.join(root, "Cargo.toml"), "[package]\nname = \"demo\"\n");
  await writeFile(path.join(root, "pyproject.toml"), "[project]\nname = \"demo\"\n");
  assert.deepEqual(await detectProfiles(root), ["rust", "python"]);
});

await test("buildPrecommitConfig includes common hooks and requested profiles", () => {
  const config = buildPrecommitConfig(["python", "rust"]);
  assert.match(config, /repo: https:\/\/github\.com\/pre-commit\/pre-commit-hooks/);
  assert.match(config, /id: typos/);
  assert.match(config, /repo: https:\/\/github\.com\/astral-sh\/ruff-pre-commit/);
  assert.match(config, /id: ruff-check/);
  assert.match(config, /id: cargo-fmt/);
  assert.match(config, /cargo clippy --workspace --all-targets --all-features -- -D warnings/);
  assert.equal(config.endsWith("\n"), true);
});

await test("buildPrecommitConfig omits unrequested profile hooks", () => {
  const config = buildPrecommitConfig(["python"]);
  assert.match(config, /id: ruff-format/);
  assert.doesNotMatch(config, /id: cargo-clippy/);
});

await test("extension registers /add-precommit command", () => {
  const commands = [];
  precommitSetup({
    registerCommand(name, definition) {
      commands.push({ name, definition });
    },
  });
  assert.equal(commands.length, 1);
  assert.equal(commands[0].name, "add-precommit");
  assert.equal(typeof commands[0].definition.handler, "function");
});
