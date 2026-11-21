import { register } from "node:module";

/*
 * Registers the "@/" resolver into the process that is about to run a test
 * file. Passed to node with --import, so the hook is in place before the
 * test file's own imports are resolved.
 *
 * Separate from alias-hooks.mjs because a resolve hook runs on a loader
 * thread and cannot register itself.
 */
register(new URL("./alias-hooks.mjs", import.meta.url));
