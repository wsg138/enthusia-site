import { cloudflareTest } from "@cloudflare/vitest-pool-workers";
import { defineConfig } from "vitest/config";

const TEST_SIGNING_KEY = "market-api-test-key".padEnd(48, "-");

export default defineConfig({
  plugins: [
    cloudflareTest({
      wrangler: { configPath: "./wrangler.jsonc" },
      miniflare: { bindings: { MARKET_SYNC_SECRET: TEST_SIGNING_KEY } },
    }),
  ],
  test: { globals: false, fileParallelism: false },
});
