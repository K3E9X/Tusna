// Resolver hook for `node --test`: the codebase uses extensionless relative imports
// (Next/bundler style). Node's ESM loader needs explicit extensions, so append ".ts"
// for extensionless relative specifiers. Lets tests import the real lib modules.
export async function resolve(specifier, context, nextResolve) {
  if (specifier.startsWith(".") && !/\.(ts|js|mjs|cjs|json)$/i.test(specifier)) {
    try { return await nextResolve(specifier + ".ts", context); } catch { /* fall through */ }
  }
  return nextResolve(specifier, context);
}
