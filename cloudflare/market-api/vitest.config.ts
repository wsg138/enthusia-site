import { cloudflareTest } from "@cloudflare/vitest-pool-workers";
import { defineConfig } from "vitest/config";

export default defineConfig({
  plugins: [
    cloudflareTest({
      wrangler: { configPath: "./wrangler.jsonc" },
      miniflare: { bindings: { MARKET_SYNC_SECRET: "local-test-secret-with-sufficient-entropy" } },
    }),
  ],
  test: { globals: false, fileParallelism: false },
});
