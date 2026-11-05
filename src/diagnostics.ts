import type { Diagnostic, DiagnosticSeverity, SourceSpan } from "./types.js";

const severityOrder: Record<DiagnosticSeverity, number> = {
  error: 0,
  warning: 1,
  info: 2,
};

export function hasErrors(diagnostics: readonly Diagnostic[]): boolean {
  return diagnostics.some((diagnostic) => diagnostic.severity === "error");
}

export function sortDiagnostics(
  diagnostics: readonly Diagnostic[],
): Diagnostic[] {
  return [...diagnostics].sort((left, right) => {
    const leftPath = left.span?.sourcePath ?? "";
    const rightPath = right.span?.sourcePath ?? "";
    return (
      leftPath.localeCompare(rightPath) ||
      (left.span?.start.offset ?? -1) - (right.span?.start.offset ?? -1) ||
      severityOrder[left.severity] - severityOrder[right.severity] ||
      left.code.localeCompare(right.code) ||
      left.message.localeCompare(right.message)
    );
  });
}

function markerLength(span: SourceSpan, lineText: string): number {
  if (span.start.line !== span.end.line)
    return Math.max(1, lineText.length - span.start.column + 1);
  return Math.max(1, span.end.column - span.start.column);
}

// Keep structural newlines in the renderer; user-controlled fields are single-line
// escaped text, including C1 terminal controls and Unicode bidi overrides.
export function escapeTerminalText(value: string): string {
  return value.replace(
    /[\u0000-\u001f\u007f-\u009f\u200e-\u200f\u2028-\u202e\u2066-\u2069]/gu,
    (character) => {
      if (character === "\n") return "\\n";
      if (character === "\r") return "\\r";
      if (character === "\t") return "\\t";
      return `\\u${character.charCodeAt(0).toString(16).padStart(4, "0")}`;
    },
  );
}

export function formatDiagnostic(
  diagnostic: Diagnostic,
  source?: string,
): string {
  const severity = escapeTerminalText(diagnostic.severity.toUpperCase());
  const code = escapeTerminalText(diagnostic.code);
  const message = escapeTerminalText(diagnostic.message);
  const hint = diagnostic.hint
    ? escapeTerminalText(diagnostic.hint)
    : undefined;
  if (!diagnostic.span) {
    return `${severity} ${code}: ${message}${hint ? `\nHint: ${hint}` : ""}`;
  }

  const { span } = diagnostic;
  const header = `${escapeTerminalText(span.sourcePath)}:${span.start.line}:${span.start.column} ${severity} ${code}: ${message}`;
  if (source === undefined) {
    return `${header}${hint ? `\nHint: ${hint}` : ""}`;
  }

  const lineText = source.split(/\r?\n/u)[span.start.line - 1] ?? "";
  const gutter = String(span.start.line);
  const column = Math.max(0, span.start.column - 1);
  const prefix = escapeTerminalText(lineText.slice(0, column));
  const marked = escapeTerminalText(
    lineText.slice(column, column + markerLength(span, lineText)),
  );
  const pointer = `${" ".repeat(gutter.length)} | ${" ".repeat(prefix.length)}${"^".repeat(Math.max(1, marked.length))}`;
  return [
    header,
    "",
    `${gutter} | ${escapeTerminalText(lineText)}`,
    pointer,
    ...(hint ? ["", `Hint: ${hint}`] : []),
  ].join("\n");
}
