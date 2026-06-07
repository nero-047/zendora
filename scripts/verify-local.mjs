import { spawn } from "node:child_process";
import { createServer } from "node:net";

const port = process.env.VERIFY_PORT || "3100";
const baseUrl = `http://localhost:${port}`;

function runCommand(command, args, options = {}) {
  return new Promise((resolve, reject) => {
    const child = spawn(command, args, {
      env: {
        ...process.env,
        ...options.env,
      },
      shell: false,
      stdio: options.stdio || "inherit",
    });

    child.on("error", reject);
    child.on("exit", (code) => {
      if (code === 0) {
        resolve();
        return;
      }

      reject(new Error(`${command} ${args.join(" ")} exited with ${code}.`));
    });
  });
}

async function assertPortAvailable(portNumber) {
  await new Promise((resolve, reject) => {
    const server = createServer();

    server.once("error", (error) => {
      if (error.code === "EADDRINUSE") {
        reject(
          new Error(
            `Port ${portNumber} is already in use. Set VERIFY_PORT to a free port and retry.`,
          ),
        );
        return;
      }

      reject(error);
    });
    server.once("listening", () => {
      server.close(resolve);
    });
    server.listen(portNumber, "127.0.0.1");
  });
}

async function waitForServer(child, url, timeoutMs = 15000) {
  const deadline = Date.now() + timeoutMs;

  while (Date.now() < deadline) {
    if (child.exitCode !== null) {
      throw new Error(`Production server exited early with ${child.exitCode}.`);
    }

    try {
      const response = await fetch(url);

      if (response.ok) {
        return;
      }
    } catch {
      // Keep polling until the production server is ready or the timeout hits.
    }

    await new Promise((resolve) => setTimeout(resolve, 250));
  }

  throw new Error(`Timed out waiting for ${url}.`);
}

function startProductionServer() {
  return spawn("npm", ["run", "start"], {
    env: {
      ...process.env,
      CLERK_SECRET_KEY: "",
      ENABLE_DEMO_DATA: "1",
      NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY: "",
      NEXT_PUBLIC_SUPABASE_ANON_KEY: "",
      NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY: "",
      NEXT_PUBLIC_SUPABASE_URL: "",
      PORT: port,
      SUPABASE_SECRET_KEY: "",
      SUPABASE_SERVICE_ROLE_KEY: "",
      SUPABASE_STORAGE_S3_ACCESS_KEY_ID: "",
      SUPABASE_STORAGE_S3_ENDPOINT: "",
      SUPABASE_STORAGE_S3_REGION: "",
      SUPABASE_STORAGE_S3_SECRET_ACCESS_KEY: "",
    },
    shell: false,
    stdio: "inherit",
  });
}

async function stopServer(child) {
  if (child.exitCode !== null) {
    return;
  }

  child.kill("SIGINT");

  await new Promise((resolve) => {
    const timer = setTimeout(() => {
      child.kill("SIGTERM");
      resolve();
    }, 3000);

    child.once("exit", () => {
      clearTimeout(timer);
      resolve();
    });
  });
}

async function main() {
  await assertPortAvailable(Number(port));
  await runCommand("git", ["diff", "--check"]);
  await runCommand("npm", ["run", "typecheck"]);
  await runCommand("npm", ["run", "lint"]);
  await runCommand("npm", ["test"]);
  await runCommand("npm", ["run", "build"]);

  const server = startProductionServer();

  try {
    await waitForServer(server, `${baseUrl}/api/health`);
    await runCommand("npm", ["run", "smoke"], {
      env: {
        SMOKE_BASE_URL: baseUrl,
      },
    });
  } finally {
    await stopServer(server);
  }

  console.log(`Local production verification passed for ${baseUrl}.`);
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
});
