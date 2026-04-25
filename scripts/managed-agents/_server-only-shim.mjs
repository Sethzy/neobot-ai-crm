/**
 * Node loader shim — turns `import "server-only"` into a no-op for CLI scripts.
 *
 * The `server-only` package throws unconditionally on load; Webpack/Turbopack
 * rewrite it to an empty module on the server. CLI scripts (tsx) have no
 * bundler, so the throw fires and breaks publish/migration scripts that
 * transitively import server-only modules.
 *
 * Usage: `node --import ./scripts/managed-agents/_server-only-shim.mjs ...`
 */
import { register } from "node:module";

register("./_server-only-shim-loader.mjs", import.meta.url);
