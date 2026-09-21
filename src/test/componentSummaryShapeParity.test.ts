import * as assert from "node:assert";
import * as fs from "node:fs";
import * as path from "node:path";
import { Project } from "ts-morph";

// Structural safety net for the src/-vs-client/ compilation boundary: see
// client/coverage.ts's own comment on StaticComponentSummary for why that
// file can't just `import { ComponentSummary } from "../src/staticAnalysis"`
// (client/ builds under tsconfig.client.json via webpack/ts-loader, a
// separate compilation unit from src/'s own tsc build) and instead keeps a
// hand-maintained, matching copy. Neither file's own compiler run can catch
// the two drifting apart from each other -- this test is what actually
// catches it, by parsing both interfaces' property lists straight off their
// source text (syntactically, independent of either file's own imports or
// tsconfig) and failing loudly the moment they stop matching field-for-field.
suite("ComponentSummary / StaticComponentSummary shape parity", () => {
  function readInterfaceProperties(filePath: string, interfaceName: string): string[] {
    const project = new Project({
      useInMemoryFileSystem: true,
      skipAddingFilesFromTsConfig: true,
      skipLoadingLibFiles: true,
    });
    const sourceFile = project.createSourceFile(
      path.basename(filePath),
      fs.readFileSync(filePath, "utf8"),
    );
    const declaration = sourceFile.getInterfaceOrThrow(interfaceName);
    return declaration
      .getProperties()
      .map((prop) => `${prop.getName()}: ${prop.getTypeNodeOrThrow().getText()}`)
      .sort();
  }

  test("client/coverage.ts's StaticComponentSummary has exactly the same fields and types as staticAnalysis.ts's canonical ComponentSummary", () => {
    const canonicalFields = readInterfaceProperties(
      path.join(__dirname, "..", "..", "src", "staticAnalysis.ts"),
      "ComponentSummary",
    );
    const webviewCopyFields = readInterfaceProperties(
      path.join(__dirname, "..", "..", "client", "coverage.ts"),
      "StaticComponentSummary",
    );

    assert.deepStrictEqual(
      webviewCopyFields,
      canonicalFields,
      "client/coverage.ts's StaticComponentSummary has drifted from " +
        "staticAnalysis.ts's canonical ComponentSummary -- update the " +
        "hand-maintained webview-side copy to match",
    );
  });
});
