import { spawnSync } from "node:child_process";
import { mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";

const packageRoot = resolve(import.meta.dirname, "..");
const expectedPath = join(packageRoot, "src", "schema.d.ts");
const temporaryDirectory = mkdtempSync(join(tmpdir(), "kkaeddak-openapi-"));
const generatedPath = join(temporaryDirectory, "schema.d.ts");

try {
  const result = spawnSync(
    join(packageRoot, "node_modules", ".bin", "openapi-typescript"),
    [resolve(packageRoot, "..", "..", "openapi.json"), "-o", generatedPath],
    { encoding: "utf8" },
  );
  if (result.status !== 0) {
    process.stderr.write(result.stderr);
    process.exit(result.status ?? 1);
  }

  if (readFileSync(expectedPath, "utf8") !== readFileSync(generatedPath, "utf8")) {
    process.stderr.write("src/schema.d.ts is stale; run npm run generate.\n");
    process.exit(1);
  }
} finally {
  rmSync(temporaryDirectory, { force: true, recursive: true });
}
