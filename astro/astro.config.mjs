import cloudflare from "@astrojs/cloudflare";
import { defineConfig } from "astro/config";

// A server-rendered Astro app, built for Workers.
export default defineConfig({
  output: "server",
  adapter: cloudflare(),
});
