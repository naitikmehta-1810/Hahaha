import { execSync } from "node:child_process";

const port = Number(process.env.PORT ?? 4000);

function freePortWindows(portNumber) {
  let output = "";
  try {
    output = execSync(`netstat -ano`, { encoding: "utf8" });
  } catch {
    return;
  }

  const pids = new Set();
  for (const line of output.split(/\r?\n/)) {
    if (!line.includes(`:${portNumber}`) || !line.includes("LISTENING")) {
      continue;
    }
    const parts = line.trim().split(/\s+/);
    const pid = parts[parts.length - 1];
    if (pid && /^\d+$/.test(pid) && pid !== "0") {
      pids.add(pid);
    }
  }

  for (const pid of pids) {
    try {
      execSync(`taskkill /PID ${pid} /F`, { stdio: "ignore" });
      console.log(`[dev] freed port ${portNumber} (killed PID ${pid})`);
    } catch {
      // already gone
    }
  }
}

function freePortUnix(portNumber) {
  try {
    const pids = execSync(`lsof -tiTCP:${portNumber} -sTCP:LISTEN`, {
      encoding: "utf8",
    })
      .trim()
      .split(/\s+/)
      .filter(Boolean);

    for (const pid of pids) {
      try {
        execSync(`kill -9 ${pid}`, { stdio: "ignore" });
        console.log(`[dev] freed port ${portNumber} (killed PID ${pid})`);
      } catch {
        // already gone
      }
    }
  } catch {
    // nothing listening
  }
}

if (process.platform === "win32") {
  freePortWindows(port);
} else {
  freePortUnix(port);
}
