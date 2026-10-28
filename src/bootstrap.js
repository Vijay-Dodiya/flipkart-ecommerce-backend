
import dns from "node:dns";

// Fix the SRV DNS issue on Windows.
// On Railway/Linux, use the default DNS configuration.
if (process.platform === "win32") {
  dns.setServers(["1.1.1.1", "1.0.0.1"]);
}

// Start the application only after DNS is configured.
await import("./app.js");
