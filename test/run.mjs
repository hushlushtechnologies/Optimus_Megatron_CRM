import { spawn } from "node:child_process";
import { readdirSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

/*
|--------------------------------------------------------------------------
| RUNNING THE TESTS
|--------------------------------------------------------------------------
|
|   node test/run.mjs                      every test file
|   node test/run.mjs offer-engine         the ones whose name matches
|
| Each test file runs in its own child process. That is not caution for its
| own sake: several of these files call process.exit() when they finish, so
| importing them one after another into a single process means the first one
| to exit takes the whole run with it — and the suite silently reports
| success having run one file out of ten. One process per file also means a
| file that crashes is one failure rather than the end of the run.
|
| Requires Node 22.6 or later, for --experimental-strip-types to run the
| TypeScript test files without a build step.
*/

const here = path.dirname(fileURLToPath(import.meta.url));

const filter = process.argv[2] ?? "";

const files = readdirSync(here)
  .filter((name) => name.endsWith("-test.mts"))
  .filter((name) => (filter ? name.includes(filter) : true))
  .sort();

if (files.length === 0) {
  console.error(filter ? `No test files match "${filter}".` : "No test files found.");
  process.exit(1);
}

/** Runs one file, resolving to its exit code. */
function runFile(name) {
  return new Promise((resolve) => {
    const child = spawn(
      process.execPath,
      [
        "--experimental-strip-types",
        "--no-warnings",
        "--import",
        path.join(here, "register-alias.mjs"),
        path.join(here, name),
      ],
      { stdio: "inherit", cwd: process.cwd() },
    );

    child.on("exit", (code) => resolve(code ?? 1));
    child.on("error", () => resolve(1));
  });
}

const failures = [];

for (const name of files) {
  console.log(`\n${"=".repeat(60)}\n${name}\n${"=".repeat(60)}`);

  const code = await runFile(name);

  if (code !== 0) failures.push(name);
}

console.log(`\n${"=".repeat(60)}`);

if (failures.length > 0) {
  console.error(`FAILED: ${failures.length} of ${files.length}\n  ${failures.join("\n  ")}`);
  process.exit(1);
}

console.log(`All ${files.length} test file(s) passed.`);
