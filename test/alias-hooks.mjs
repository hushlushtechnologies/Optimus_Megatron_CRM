import { existsSync, statSync } from "node:fs";
import path from "node:path";
import { pathToFileURL } from "node:url";

/*
|--------------------------------------------------------------------------
| RESOLVING "@/" FOR THE TEST FILES
|--------------------------------------------------------------------------
|
| The application imports itself with the "@/" alias, which tsconfig maps to
| the repository root. Next.js and tsc both understand that. Plain Node does
| not, so a test that imports any module which in turn imports "@/..." fails
| to resolve before a single assertion runs.
|
| This is a Node module-resolution hook that applies the same mapping, plus
| the extension and index resolution a bundler does. It exists so the test
| files can import real application modules rather than copies of them —
| a test against a copy of the rules engine passes while the engine itself
| is broken.
|
| Used via test/run.mjs, which registers it and then runs a test file.
*/

const root = process.cwd();

/** The candidate paths a bundler would try for a specifier without an extension. */
function candidates(base) {
  return [
    base,
    `${base}.ts`,
    `${base}.tsx`,
    `${base}.mts`,
    `${base}.js`,
    `${base}.mjs`,
    path.join(base, "index.ts"),
    path.join(base, "index.tsx"),
    path.join(base, "index.js"),
  ];
}

function resolveToFile(absolute) {
  for (const candidate of candidates(absolute)) {
    if (!existsSync(candidate)) continue;

    try {
      if (statSync(candidate).isDirectory()) continue;
    } catch {
      continue;
    }

    return candidate;
  }

  return null;
}

export async function resolve(specifier, context, nextResolve) {
  if (specifier.startsWith("@/")) {
    const absolute = path.join(root, specifier.slice(2));
    const file = resolveToFile(absolute);

    if (file) {
      return { url: pathToFileURL(file).href, shortCircuit: true };
    }

    /*
     * Deliberately not silent. A mis-mapped alias that falls through to the
     * default resolver produces "Cannot find package '@/src'", which reads
     * like a missing dependency and sends somebody to npm install.
     */
    throw new Error(
      `alias-hooks: could not resolve "${specifier}" under ${root}. ` +
        `Run the tests from the repository root.`,
    );
  }

  /*
   * A relative import of an extensionless path, which the application also
   * relies on the bundler for.
   */
  if (specifier.startsWith(".") && !path.extname(specifier)) {
    const parentPath = context.parentURL ? new URL(context.parentURL).pathname : root;
    const absolute = path.resolve(path.dirname(parentPath), specifier);
    const file = resolveToFile(absolute);

    if (file) {
      return { url: pathToFileURL(file).href, shortCircuit: true };
    }
  }

  return nextResolve(specifier, context);
}
