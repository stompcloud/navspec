import { describe, expect, it } from "vitest";

import { compileNavigation } from "../src/compiler.js";
import { formatDiagnostic } from "../src/diagnostics.js";

describe("formatDiagnostic", () => {
  it("escapes decoded terminal controls in malformed node references", () => {
    const source = 'root:\n  items: ["\\u001b[2Jmissing"]\n';
    const diagnostic = compileNavigation(source).diagnostics.find(
      (d) => d.code === "NAV003",
    )!;
    const output = formatDiagnostic(diagnostic, source);
    expect(output).not.toContain("\x1b");
    expect(output).toContain("\\u001b[2Jmissing");
  });
  it("escapes all diagnostic fields and keeps the source pointer aligned", () => {
    const output = formatDiagnostic(
      {
        code: "NAV003",
        severity: "error",
        message: "bad\n::error::spoof\x1b[2J",
        hint: "hint\r\x9b",
        span: {
          sourcePath: "nav\x1b.yaml",
          start: { offset: 2, line: 1, column: 3 },
          end: { offset: 3, line: 1, column: 4 },
        },
      },
      "a\x1bb",
    );
    expect(output).not.toMatch(/[\u0000-\u0009\u000b-\u001f\u007f-\u009f]/u);
    expect(output).toContain("bad\\n::error::spoof\\u001b[2J");
    expect(output).toContain("hint\\r\\u009b");
    expect(output).toContain("1 | a\\u001bb\n  |        ^");
  });

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
