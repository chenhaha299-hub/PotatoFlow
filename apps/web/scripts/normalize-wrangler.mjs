import { readFile, writeFile } from "node:fs/promises";

const wranglerPath = new URL("../dist/server/wrangler.json", import.meta.url);

try {
  const config = JSON.parse(await readFile(wranglerPath, "utf8"));
  if (Array.isArray(config.compatibility_flags) && config.compatibility_flags.length === 0) {
    delete config.compatibility_flags;
    await writeFile(wranglerPath, `${JSON.stringify(config)}\n`, "utf8");
  }
} catch (error) {
  console.error("Unable to normalize the generated Wrangler configuration.");
  throw error;
}
