import { afterEach, describe, expect, test } from "vitest";
import { existsSync, readFileSync } from "node:fs";
import path from "node:path";
import { generatePlugin, type GeneratedPlugin } from "../../src/claude_code/plugin_generator.js";

describe("generatePlugin", () => {
  let plugin: GeneratedPlugin | undefined;

  afterEach(async () => {
    await plugin?.cleanup();
  });

  test("creates temp directory with plugin manifest", async () => {
    plugin = await generatePlugin("/tmp/test.sock");
    const manifestPath = path.join(plugin.pluginDir, ".claude-plugin", "plugin.json");
    expect(existsSync(manifestPath)).toBe(true);
    const manifest = JSON.parse(readFileSync(manifestPath, "utf8"));
    expect(manifest.name).toBe("toll-free-harness");
    expect(manifest.version).toBe("1.0.0");
  });

  test("creates hooks.json with all 5 hook types", async () => {
    plugin = await generatePlugin("/tmp/test.sock");
    const hooksPath = path.join(plugin.pluginDir, "hooks", "hooks.json");
    expect(existsSync(hooksPath)).toBe(true);
    const hooks = JSON.parse(readFileSync(hooksPath, "utf8"));
    expect(Object.keys(hooks.hooks)).toEqual(
      expect.arrayContaining(["PreToolUse", "PermissionRequest", "PostToolUse", "UserPromptSubmit", "Stop"])
    );
  });

  test("hooks.json commands reference ${CLAUDE_PLUGIN_ROOT}/hook_client.js", async () => {
    plugin = await generatePlugin("/tmp/test.sock");
    const hooksPath = path.join(plugin.pluginDir, "hooks", "hooks.json");
    const hooks = JSON.parse(readFileSync(hooksPath, "utf8"));
    const command = hooks.hooks.PreToolUse[0].hooks[0].command;
    expect(command).toContain("${CLAUDE_PLUGIN_ROOT}/hook_client.js");
  });

  test("hooks.json commands include the socket path", async () => {
    plugin = await generatePlugin("/tmp/my-socket.sock");
    const hooksPath = path.join(plugin.pluginDir, "hooks", "hooks.json");
    const hooks = JSON.parse(readFileSync(hooksPath, "utf8"));
    const command = hooks.hooks.PreToolUse[0].hooks[0].command;
    expect(command).toContain("/tmp/my-socket.sock");
  });

  test("hook_client is copied into plugin dir", async () => {
    plugin = await generatePlugin("/tmp/test.sock");
    // In dev mode (vitest via tsx), the source .ts file is copied;
    // in dist mode, the built .js file is copied. Either way, a file
    // named hook_client.* should exist.
    const jsPath = path.join(plugin.pluginDir, "hook_client.js");
    expect(existsSync(jsPath)).toBe(true);
    const content = readFileSync(jsPath, "utf8");
    expect(content).toContain("socketPath"); // verify it's the real hook client
  });

  test("cleanup removes the temp directory", async () => {
    plugin = await generatePlugin("/tmp/test.sock");
    const dir = plugin.pluginDir;
    expect(existsSync(dir)).toBe(true);
    await plugin.cleanup();
    expect(existsSync(dir)).toBe(false);
    plugin = undefined; // prevent afterEach double-cleanup
  });
});
