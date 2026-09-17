export type DiagnosticSeverity = "error" | "warning" | "info";

export interface SourcePosition {
  readonly offset: number;
  readonly line: number;
  readonly column: number;
}

export interface SourceSpan {
  readonly sourcePath: string;
  readonly start: SourcePosition;
  readonly end: SourcePosition;
}

export interface Diagnostic {
  readonly code: string;
  readonly severity: DiagnosticSeverity;
  readonly message: string;
  readonly span?: SourceSpan;
  readonly hint?: string;
}

export interface ParsedNavigationNode {
  readonly id: string;
  readonly type?: string;
  readonly items?: readonly string[];
  readonly url?: string;
  readonly span: SourceSpan;
  readonly idSpan: SourceSpan;
  readonly typeSpan?: SourceSpan;
  readonly itemSpans: Readonly<Record<string, readonly SourceSpan[]>>;
  readonly urlSpan?: SourceSpan;
}

export interface ParsedNavigation {
  readonly sourcePath: string;
  readonly source: string;
  readonly nodes: readonly ParsedNavigationNode[];
}

export type NavigationNodeType = "menu" | "page" | "action" | "external-link";

export interface NavigationNode {
  readonly id: string;
  readonly type: NavigationNodeType;
  readonly items: readonly string[];
  readonly displayName: string;
  readonly url?: string;
  readonly source: SourceSpan;
}

export interface NavigationIR {
  readonly version: 1;
  readonly root: string;
  readonly nodes: readonly NavigationNode[];
}

export interface ParseResult {
  readonly ast?: ParsedNavigation;
  readonly diagnostics: readonly Diagnostic[];
}

export interface CompileOptions {
  readonly sourcePath?: string;
  readonly root?: string;
}

export interface CompileResult {
  readonly ast?: ParsedNavigation;
  readonly ir?: NavigationIR;
  readonly diagnostics: readonly Diagnostic[];
}

export interface NavSpecConfig {
  readonly input: string;
  readonly root: string;
  readonly outputs: NavSpecOutputsConfig;
}

export interface ExpoRouterOutputConfig {
  readonly generatedDirectory: string;
  readonly routesDirectory?: string;
  readonly publicPath: string;
}

export interface NavSpecOutputsConfig {
  readonly expoRouter?: ExpoRouterOutputConfig;
}

export interface GeneratedArtifact {
  readonly path: string;
  readonly contents: string;
  readonly ownership: "generated";
}

export interface TargetGenerationResult {
  readonly artifacts: readonly GeneratedArtifact[];
  readonly diagnostics: readonly Diagnostic[];
}
