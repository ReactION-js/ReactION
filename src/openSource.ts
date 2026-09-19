import * as fs from "fs";
import * as path from "path";

// Deliberately free of any `vscode` import (like devtoolsBridge.ts) so this
// stays plain-mocha-testable under Node -- see src/test/openSource.test.ts
// and src/sourceOpeningWiring.ts, which wraps this for the extension host.

// True only for a real, resolvable file -- guards against e.g. workspaceRoot
// itself matching when fileName resolves to "" (fs.existsSync would be true
// for the directory too, but showTextDocument needs an actual file).
function isRealFile(candidate: string): boolean {
  try {
    return fs.existsSync(candidate) && fs.statSync(candidate).isFile();
  } catch {
    return false;
  }
}

// A bundler-emitted sourceURL like "webpack://<pkg>/./src/Foo.tsx" (or the
// scheme://host/ variant of any other bundler) -- everything after the first
// "/" past the scheme+host is a path relative to the project root.
const BUNDLER_URL = /^[a-z][a-z0-9+.-]*:\/\/[^/]*\/(.*)$/i;

// Resolves the raw `fileName` off the protocol's `source` tuple to a real
// path on disk, or undefined if it can't be found. Deliberately does NOT
// attempt sourcemap symbolication: a minified/production bundle's fileName
// (e.g. a served bundle URL with no matching workspace file) is expected to
// fail here, and the caller shows an informational message rather than
// treating that as an error.
export function resolveSourceFileName(
  fileName: string,
  workspaceRoot: string,
): string | undefined {
  if (path.isAbsolute(fileName)) {
    return isRealFile(fileName) ? fileName : undefined;
  }

  const bundlerMatch = BUNDLER_URL.exec(fileName);
  const relativePath = (bundlerMatch ? bundlerMatch[1] : fileName).replace(/^\.\//, "");
  const resolved = path.resolve(workspaceRoot, relativePath);
  return isRealFile(resolved) ? resolved : undefined;
}
