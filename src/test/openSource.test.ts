import * as assert from "node:assert";
import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import { resolveSourceFileName } from "../openSource";

// Plain mocha (describe/it), run via `npm run test:e2e` against compiled
// output -- NOT vscode-test, since resolveSourceFileName has no vscode
// import (see openSource.ts). Uses a real temp directory/file on disk rather
// than mocking fs, per the task brief.
describe("resolveSourceFileName", () => {
  let workspaceRoot: string;
  let outsideFile: string;
  let symlinkIntoOutside: string;

  before(() => {
    workspaceRoot = fs.mkdtempSync(path.join(os.tmpdir(), "reaction-opensource-"));
    fs.mkdirSync(path.join(workspaceRoot, "src"), { recursive: true });
    fs.writeFileSync(path.join(workspaceRoot, "src", "Foo.tsx"), "// fixture\n");

    // A real file OUTSIDE workspaceRoot (a sibling temp dir), used to prove
    // the containment check actually rejects a real, existing file rather
    // than merely exercising the not-found path.
    const outsideDir = fs.mkdtempSync(path.join(os.tmpdir(), "reaction-opensource-outside-"));
    outsideFile = path.join(outsideDir, "Secret.txt");
    fs.writeFileSync(outsideFile, "secret\n");

    // A symlink INSIDE the workspace pointing at that outside dir, mirroring
    // pnpm's node_modules/* (symlinked into a content-addressable store) or
    // Yarn/Lerna/Nx workspaces symlinking packages/* from outside the
    // currently-open folder. A path through it is lexically inside
    // workspaceRoot (isInsideWorkspace passes) and fs.existsSync/statSync
    // follow it to a real file (isRealFile passes) -- only realpath
    // resolution catches that it's physically outside.
    symlinkIntoOutside = path.join(workspaceRoot, "src", "evil-link");
    fs.symlinkSync(outsideDir, symlinkIntoOutside, "dir");
  });

  after(() => {
    fs.rmSync(workspaceRoot, { recursive: true, force: true });
    fs.rmSync(path.dirname(outsideFile), { recursive: true, force: true });
  });

  it("returns an already-absolute path that exists on disk", () => {
    const absolute = path.join(workspaceRoot, "src", "Foo.tsx");
    assert.strictEqual(resolveSourceFileName(absolute, workspaceRoot), absolute);
  });

  it("returns undefined for an absolute path that does not exist", () => {
    const absolute = path.join(workspaceRoot, "src", "DoesNotExist.tsx");
    assert.strictEqual(resolveSourceFileName(absolute, workspaceRoot), undefined);
  });

  it("resolves a webpack://<pkg>/./src/Foo.tsx-style URL against the workspace root", () => {
    const resolved = resolveSourceFileName("webpack://my-app/./src/Foo.tsx", workspaceRoot);
    assert.strictEqual(resolved, path.join(workspaceRoot, "src", "Foo.tsx"));
  });

  it("resolves a webpack:///./src/Foo.tsx URL with an empty namespace", () => {
    const resolved = resolveSourceFileName("webpack:///./src/Foo.tsx", workspaceRoot);
    assert.strictEqual(resolved, path.join(workspaceRoot, "src", "Foo.tsx"));
  });

  it("resolves a plain relative path against the workspace root", () => {
    const resolved = resolveSourceFileName("src/Foo.tsx", workspaceRoot);
    assert.strictEqual(resolved, path.join(workspaceRoot, "src", "Foo.tsx"));
  });

  it("resolves a plain relative path with a leading ./", () => {
    const resolved = resolveSourceFileName("./src/Foo.tsx", workspaceRoot);
    assert.strictEqual(resolved, path.join(workspaceRoot, "src", "Foo.tsx"));
  });

  it("returns undefined for a not-found relative path", () => {
    assert.strictEqual(resolveSourceFileName("src/Missing.tsx", workspaceRoot), undefined);
  });

  it("returns undefined for a served bundle URL with no matching workspace file", () => {
    assert.strictEqual(
      resolveSourceFileName("http://127.0.0.1:4000/app.js", workspaceRoot),
      undefined,
    );
  });

  it("returns undefined for a directory rather than a real file", () => {
    assert.strictEqual(resolveSourceFileName("src", workspaceRoot), undefined);
  });

  // Regression: resolveSourceFileName used to hand back any real file on
  // disk, including ones outside the workspace -- a page-controlled fileName
  // could exploit that for arbitrary local file disclosure via "Open in
  // editor". Both cases below point at a real, existing file outside
  // workspaceRoot, so a passing test proves the containment check, not just
  // fs.existsSync failing.
  it("returns undefined for an absolute path to a real file outside the workspace", () => {
    assert.strictEqual(resolveSourceFileName(outsideFile, workspaceRoot), undefined);
  });

  it("returns undefined for a ../ traversal that resolves to a real file outside the workspace", () => {
    const traversal = path.relative(workspaceRoot, outsideFile);
    assert.strictEqual(resolveSourceFileName(traversal, workspaceRoot), undefined);
  });

  it("returns undefined for a deep ../ traversal chain reaching a real file outside the workspace", () => {
    const withoutLeadingSlash = outsideFile.replace(/^[/\\]/, "");
    const deepTraversal = "../".repeat(10) + withoutLeadingSlash;
    assert.strictEqual(resolveSourceFileName(deepTraversal, workspaceRoot), undefined);
  });

  it("returns undefined for a webpack:// URL whose path traverses outside the workspace", () => {
    const traversal = path.relative(workspaceRoot, outsideFile);
    assert.strictEqual(
      resolveSourceFileName(`webpack://my-app/./${traversal}`, workspaceRoot),
      undefined,
    );
  });

  // Regression: a path with no ".." at all -- lexically inside workspaceRoot
  // -- but that traverses a symlink to a file physically outside it used to
  // pass both isInsideWorkspace and isRealFile.
  it("returns undefined for a path that traverses a symlink pointing outside the workspace", () => {
    const throughSymlink = path.join(symlinkIntoOutside, "Secret.txt");
    assert.strictEqual(resolveSourceFileName(throughSymlink, workspaceRoot), undefined);
  });
});
