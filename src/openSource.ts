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

// `fileName` is untrusted: it comes from the INSPECTED PAGE's own JS runtime
// (react-devtools-core parses the page's live stack trace), so a malicious
// or compromised dev app can make it report anything, e.g.
// "../../../../etc/hosts" or an absolute "/etc/hosts". Without this check,
// resolveSourceFileName would happily hand back a real path outside the
// workspace and wireSourceOpening would open it -- an arbitrary local file
// disclosure via a single button click. Confine every result to the
// workspace root regardless of which branch produced it.
function isInsideWorkspace(candidate: string, workspaceRoot: string): boolean {
  const rel = path.relative(workspaceRoot, candidate);
  return rel === "" || (!rel.startsWith("..") && !path.isAbsolute(rel));
}

// isInsideWorkspace above is purely lexical, on the UNRESOLVED path, but
// fs.existsSync/statSync (via isRealFile) transparently follow symlinks: a
// path that's lexically inside the workspace can still traverse a symlink to
// a file that's physically outside it (pnpm symlinks node_modules/* into a
// content-addressable store outside the project; Yarn/Lerna/Nx workspaces
// often symlink packages/* outside the currently-open folder). Realpath BOTH
// sides before comparing, not just the candidate -- on macOS, /var itself is
// a symlink to /private/var, so a workspaceRoot under /var/... would
// otherwise be falsely rejected against its own (correctly) realpath'd
// candidate.
function isReallyInsideWorkspace(candidate: string, workspaceRoot: string): boolean {
  try {
    return isInsideWorkspace(fs.realpathSync(candidate), fs.realpathSync(workspaceRoot));
  } catch {
    return false;
  }
}

function isSafeToOpen(candidate: string, workspaceRoot: string): boolean {
  return (
    isInsideWorkspace(candidate, workspaceRoot) &&
    isRealFile(candidate) &&
    isReallyInsideWorkspace(candidate, workspaceRoot)
  );
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
// treating that as an error. Every branch is gated on isSafeToOpen, not just
// the resolved-relative-path one -- see that function's comment.
export function resolveSourceFileName(
  fileName: string,
  workspaceRoot: string,
): string | undefined {
  if (path.isAbsolute(fileName)) {
    return isSafeToOpen(fileName, workspaceRoot) ? fileName : undefined;
  }

  const bundlerMatch = BUNDLER_URL.exec(fileName);
  const relativePath = (bundlerMatch ? bundlerMatch[1] : fileName).replace(/^\.\//, "");
  const resolved = path.resolve(workspaceRoot, relativePath);
  return isSafeToOpen(resolved, workspaceRoot) ? resolved : undefined;
}
