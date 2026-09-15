import { describe, expect, it } from "vitest";

import { formatDiagnostic } from "../src/diagnostics.js";

describe("formatDiagnostic", () => {
  it("renders a compiler-style source frame", () => {
    expect(
      formatDiagnostic(
        {
          code: "NAV003",
          severity: "error",
          message: 'Unknown node "missing".',
          hint: 'Did you mean "existing"?',
          span: {
            sourcePath: "nav.yaml",
            start: { offset: 20, line: 3, column: 7 },
            end: { offset: 27, line: 3, column: 14 },
          },
        },
        "root:\n  items:\n    - missing\n",
      ),
    ).toBe(`nav.yaml:3:7 ERROR NAV003: Unknown node "missing".

3 |     - missing
  |       ^^^^^^^

Hint: Did you mean "existing"?`);
  });
});
