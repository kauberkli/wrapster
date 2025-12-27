import "dotenv/config";
import { defineConfig } from "@trigger.dev/sdk/v3";

export default defineConfig({
  project: process.env.TRIGGER_PROJECT_ID || "proj_karhbpgzlhrvuvpilxmk",
  runtime: "node",
  logLevel: "log",
  maxDuration: 300, // 5 minutes max for import/export tasks
  retries: {
    enabledInDev: true,
    default: {
      maxAttempts: 3,
      minTimeoutInMs: 1000,
      maxTimeoutInMs: 10000,
      factor: 2,
      randomize: true,
    },
  },
  dirs: ["./trigger"],
});
