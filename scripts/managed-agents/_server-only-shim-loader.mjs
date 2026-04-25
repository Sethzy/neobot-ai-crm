/**
 * Node loader hook — resolves `server-only` to an empty data: URL.
 *
 * Pairs with `_server-only-shim.mjs`. See that file for context.
 */
const EMPTY_MODULE = "data:text/javascript,export%20default%20%7B%7D%3B";

export async function resolve(specifier, context, nextResolve) {
  if (specifier === "server-only" || specifier === "client-only") {
    return { url: EMPTY_MODULE, shortCircuit: true, format: "module" };
  }
  return nextResolve(specifier, context);
}
