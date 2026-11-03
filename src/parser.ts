import {
  isMap,
  isScalar,
  isSeq,
  LineCounter,
  parseDocument,
  type Node as YamlNode,
  type Pair,
  type Scalar,
} from "yaml";

import type {
  Diagnostic,
  ParseResult,
  ParsedNavigationNode,
  SourceSpan,
} from "./types.js";

type RangedYamlNode = YamlNode & { range?: readonly [number, number, number] };

function spanFor(
  node: { range?: readonly number[] } | null | undefined,
  sourcePath: string,
  lineCounter: LineCounter,
): SourceSpan {
  const startOffset = node?.range?.[0] ?? 0;
  const endOffset = node?.range?.[1] ?? startOffset + 1;
  const start = lineCounter.linePos(startOffset);
  const end = lineCounter.linePos(Math.max(startOffset + 1, endOffset));
  return {
    sourcePath,
    start: { offset: startOffset, line: start.line, column: start.col },
    end: { offset: endOffset, line: end.line, column: end.col },
  };
}

function error(code: string, message: string, span?: SourceSpan): Diagnostic {
  return span
    ? { code, severity: "error", message, span }
    : { code, severity: "error", message };
}

function scalarString(node: unknown): string | undefined {
  return isScalar(node) && typeof node.value === "string"
    ? node.value
    : undefined;
}

function propertyName(pair: Pair): string | undefined {
  return scalarString(pair.key);
}

export function parseNavigationYaml(
  source: string,
  sourcePath = "nav.yaml",
): ParseResult {
  const lineCounter = new LineCounter();
  const document = parseDocument(source, {
    lineCounter,
    prettyErrors: false,
    uniqueKeys: true,
  });
  const diagnostics: Diagnostic[] = document.errors.map((yamlError) => {
    const startOffset = yamlError.pos[0];
    const endOffset = yamlError.pos[1];
    const start = lineCounter.linePos(startOffset);
    const end = lineCounter.linePos(Math.max(startOffset + 1, endOffset));
    return error("NAVP001", yamlError.message, {
      sourcePath,
      start: { offset: startOffset, line: start.line, column: start.col },
      end: { offset: endOffset, line: end.line, column: end.col },
    });
  });

  if (document.errors.length > 0) return { diagnostics };
  if (!isMap(document.contents)) {
    diagnostics.push(
      error(
        "NAVP002",
        "The navigation document must be a top-level mapping of node IDs to node definitions.",
        spanFor(
          document.contents as RangedYamlNode | null,
          sourcePath,
          lineCounter,
        ),
      ),
    );
    return { diagnostics };
  }

  const nodes: ParsedNavigationNode[] = [];
  for (const nodePair of document.contents.items) {
    const id = scalarString(nodePair.key);
    const idSpan = spanFor(
      nodePair.key as RangedYamlNode | null,
      sourcePath,
      lineCounter,
    );
    if (id === undefined) {
      diagnostics.push(
        error("NAVP003", "Each node ID must be a string.", idSpan),
      );
      continue;
    }

    const value = nodePair.value;
    const isEmptyDefinition = isScalar(value) && value.value === null;
    if (!isEmptyDefinition && !isMap(value)) {
      diagnostics.push(
        error(
          "NAVP004",
          `Node "${id}" must be an empty value or a mapping.`,
          spanFor(value as RangedYamlNode | null, sourcePath, lineCounter),
        ),
      );
      continue;
    }

    let type: string | undefined;
    let typeSpan: SourceSpan | undefined;
    let items: string[] | undefined;
    let url: string | undefined;
    let urlSpan: SourceSpan | undefined;
    const itemSpans: Record<string, SourceSpan[]> = Object.create(null);

    if (isMap(value)) {
      for (const property of value.items) {
        const name = propertyName(property);
        const keySpan = spanFor(
          property.key as RangedYamlNode | null,
          sourcePath,
          lineCounter,
        );
        if (name === undefined) {
          diagnostics.push(
            error(
              "NAVP005",
              `Properties of node "${id}" must have string keys.`,
              keySpan,
            ),
          );
          continue;
        }

        if (name === "type") {
          typeSpan = spanFor(
            property.value as RangedYamlNode | null,
            sourcePath,
            lineCounter,
          );
          type = scalarString(property.value);
          if (type === undefined) {
            diagnostics.push(
              error(
                "NAVP006",
                `Property "type" of node "${id}" must be a string.`,
                typeSpan,
              ),
            );
          }
          continue;
        }

        if (name === "url") {
          urlSpan = spanFor(
            property.value as RangedYamlNode | null,
            sourcePath,
            lineCounter,
          );
          url = scalarString(property.value);
          if (url === undefined) {
            diagnostics.push(
              error(
                "NAVP007",
                `Property "url" of node "${id}" must be a string.`,
                urlSpan,
              ),
            );
          }
          continue;
        }

        if (name === "items") {
          items = [];
          if (!isSeq(property.value)) {
            diagnostics.push(
              error(
                "NAVP008",
                `Property "items" of node "${id}" must be a sequence of node IDs.`,
                spanFor(
                  property.value as RangedYamlNode | null,
                  sourcePath,
                  lineCounter,
                ),
              ),
            );
            continue;
          }
          for (const item of property.value.items) {
            const itemSpan = spanFor(
              item as RangedYamlNode | null,
              sourcePath,
              lineCounter,
            );
            const itemId = scalarString(item);
            if (itemId === undefined) {
              diagnostics.push(
                error(
                  "NAVP009",
                  `Every item of node "${id}" must be a string node ID.`,
                  itemSpan,
                ),
              );
              continue;
            }
            items.push(itemId);
            (itemSpans[itemId] ??= []).push(itemSpan);
          }
          continue;
        }

        diagnostics.push(
          error(
            "NAVP010",
            `Unknown property "${name}" on node "${id}".`,
            keySpan,
          ),
        );
      }
    }

    nodes.push({
      id,
      ...(type === undefined ? {} : { type }),
      ...(items === undefined ? {} : { items }),
      ...(url === undefined ? {} : { url }),
      span: spanFor(
        (value ?? nodePair.key) as RangedYamlNode,
        sourcePath,
        lineCounter,
      ),
      idSpan,
      ...(typeSpan === undefined ? {} : { typeSpan }),
      itemSpans,
      ...(urlSpan === undefined ? {} : { urlSpan }),
    });
  }

  return {
    ast: { sourcePath, source, nodes },
    diagnostics,
  };
}
