import assert from "node:assert/strict";
import { createJiti } from "jiti";

const jiti = createJiti(import.meta.url);
const mod = jiti("../packages/open-zed/src/index.ts");
const openZed = mod.default ?? mod;

function test(name, fn) {
  try {
    fn();
    console.log(`ok - ${name}`);
  } catch (error) {
    console.error(`not ok - ${name}`);
    throw error;
  }
}

test("extension registers exactly the v1 tool surface", () => {
  const tools = [];
  openZed({
    registerTool(definition) {
      tools.push(definition);
    },
  });

  assert.deepEqual(
    tools.map((tool) => tool.name),
    ["open_zed"],
  );

  const [tool] = tools;
  assert.equal(tool.label, "Open in Zed");
  assert.equal(typeof tool.execute, "function");
  assert.ok(tool.parameters);
  assert.ok(tool.promptGuidelines.some((line) => line.includes("open_zed")));
});
