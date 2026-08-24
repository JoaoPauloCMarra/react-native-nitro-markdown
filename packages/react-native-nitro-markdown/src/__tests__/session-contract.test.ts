import "./setup";
import { createMarkdownSession } from "../MarkdownSession";
import {
  runSessionScenarioCorpus,
  SESSION_SCENARIO_CORPUS,
} from "../utils/session-contract";

describe("shared session contract corpus (JS adapter and C++ harness)", () => {
  it("runs every scenario in the corpus against the JS adapter", () => {
    const results = runSessionScenarioCorpus(() => createMarkdownSession());

    expect(results).toHaveLength(SESSION_SCENARIO_CORPUS.length);
    const failures = results.filter((result) => !result.pass);
    expect(failures).toEqual([]);
  });

  it("covers range, error, disposal, and listener semantics", () => {
    const names = SESSION_SCENARIO_CORPUS.map((scenario) => scenario.name);
    expect(names).toEqual(
      expect.arrayContaining([
        "append-notifies-range",
        "replace-rejects-invalid-range",
        "dispose-rejects-all-operations",
        "unsubscribe-stops-notifications",
        "getTextRange-clamps",
        "append-rejects-buffer-cap",
        "replace-rejects-buffer-cap",
      ]),
    );
  });

  it("starts every scenario from a fresh session", () => {
    runSessionScenarioCorpus(() => createMarkdownSession());

    const fresh = createMarkdownSession();
    expect(() => fresh.append("fresh")).not.toThrow();
    expect(fresh.getAllText()).toBe("fresh");
  });
});
