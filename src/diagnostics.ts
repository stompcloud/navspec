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

export function formatDiagnostic(
  diagnostic: Diagnostic,
  source?: string,
): string {
  const severity = diagnostic.severity.toUpperCase();
  if (!diagnostic.span) {
    return `${severity} ${diagnostic.code}: ${diagnostic.message}${diagnostic.hint ? `\nHint: ${diagnostic.hint}` : ""}`;
  }

  const { span } = diagnostic;
  const header = `${span.sourcePath}:${span.start.line}:${span.start.column} ${severity} ${diagnostic.code}: ${diagnostic.message}`;
  if (source === undefined) {
    return `${header}${diagnostic.hint ? `\nHint: ${diagnostic.hint}` : ""}`;
  }

  const lineText = source.split(/\r?\n/u)[span.start.line - 1] ?? "";
  const gutter = String(span.start.line);
  const pointer = `${" ".repeat(gutter.length)} | ${" ".repeat(Math.max(0, span.start.column - 1))}${"^".repeat(markerLength(span, lineText))}`;
  return [
    header,
    "",
    `${gutter} | ${lineText}`,
    pointer,
    ...(diagnostic.hint ? ["", `Hint: ${diagnostic.hint}`] : []),
  ].join("\n");
}
