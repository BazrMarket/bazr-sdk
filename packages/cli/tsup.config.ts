import { readFileSync } from "node:fs";
import { defineConfig } from "tsup";

const pkg = JSON.parse(
  readFileSync(new URL("./package.json", import.meta.url), "utf8"),
) as { version: string };

export default defineConfig({
  entry: { bazr: "src/bin.ts" },
  format: ["esm"],
  target: "node18",
  clean: true,
  sourcemap: true,
  dts: false,
  define: { __CLI_VERSION__: JSON.stringify(pkg.version) },
  banner: { js: "#!/usr/bin/env node" },
});
