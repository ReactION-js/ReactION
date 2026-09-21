import * as assert from "node:assert";
import * as fs from "node:fs";
import * as path from "node:path";
import { SUPPORTED_LANGUAGE_IDS } from "../supportedLanguages";

// Plain mocha (describe/it), run via `npm run test:e2e` against compiled
// output -- no vscode import needed, since this only reads package.json's
// own manifest and the CodeLens provider's exported language-id list.
//
// The CodeLens can only ever show up for a session that has activated the
// extension. package.json's activationEvents was `[]` until this task's
// review caught it: NONE of extension.ts's registered commands/views fire
// just from opening a matching source file, so a developer who opens a
// component file before ever running "ReactION: Launch" (or clicking the
// activity-bar icon) in that VS Code session would see no CodeLens at all --
// a silent gap, not an error. This test guards against the ONE way that fix
// can silently regress: a typo/mismatch between the four "onLanguage:*"
// activation events and the CodeLens's own document selector, either now or
// in a future edit to either list.
describe("activationEvents / SelectInstanceCodeLensProvider consistency", () => {
  it("declares an onLanguage:* activation event for every language the CodeLens covers, and no extras", () => {
    const packageJsonPath = path.join(__dirname, "..", "..", "package.json");
    const packageJson = JSON.parse(fs.readFileSync(packageJsonPath, "utf8")) as {
      activationEvents: string[];
    };

    const onLanguageEvents = packageJson.activationEvents.filter((event) =>
      event.startsWith("onLanguage:"),
    );
    const activatedLanguages = onLanguageEvents.map((event) => event.slice("onLanguage:".length)).sort();
    const codeLensLanguages = [...SUPPORTED_LANGUAGE_IDS].sort();

    assert.deepStrictEqual(
      activatedLanguages,
      codeLensLanguages,
      "package.json's onLanguage:* activationEvents must match SelectInstanceCodeLensProvider's SUPPORTED_LANGUAGE_IDS exactly",
    );
  });
});
