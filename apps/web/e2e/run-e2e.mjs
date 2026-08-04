import { spawn, spawnSync } from "node:child_process";

const url = "http://127.0.0.1:3001";
const noProxy = `127.0.0.1,localhost${process.env.NO_PROXY ? `,${process.env.NO_PROXY}` : ""}`;
const env = { ...process.env, NO_PROXY: noProxy, no_proxy: noProxy };
const forwardedArguments = process.argv
  .slice(2)
  .map((argument) => `"${argument.replaceAll('"', '\\"')}"`)
  .join(" ");

function run(command) {
  return spawn(command, { env, shell: true, stdio: "inherit" });
}

async function waitForServer() {
  const deadline = Date.now() + 120_000;
  while (Date.now() < deadline) {
    try {
      const response = await fetch(url, { signal: AbortSignal.timeout(8_000) });
      if (response.ok) return;
    } catch {
      // The development server may still be compiling.
    }
    await new Promise((resolve) => setTimeout(resolve, 750));
  }
  throw new Error(`PotatoFlow test server did not become ready at ${url}`);
}

function stopProcessTree(child) {
  if (!child?.pid) return;
  if (process.platform === "win32") {
    spawnSync("taskkill", ["/PID", String(child.pid), "/T", "/F"], {
      stdio: "ignore",
    });
  } else {
    child.kill("SIGTERM");
  }
}

const server = run("npm start -- --hostname 127.0.0.1 --port 3001");

try {
  await waitForServer();
  const tests = run(`playwright test${forwardedArguments ? ` ${forwardedArguments}` : ""}`);
  const exitCode = await new Promise((resolve) => {
    tests.once("exit", (code) => resolve(code ?? 1));
  });
  process.exitCode = exitCode;
} finally {
  stopProcessTree(server);
}
