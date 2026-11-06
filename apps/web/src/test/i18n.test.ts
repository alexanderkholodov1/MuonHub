import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import ts from "typescript";
import { expect, it } from "vitest";

function files(directory: string): string[] {
  return readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    const path = join(directory, entry.name);
    return entry.isDirectory()
      ? files(path)
      : path.endsWith(".tsx") && !path.includes(".test.")
        ? [path]
        : [];
  });
}
function literals(source: string, path: string): string[] {
  const tree = ts.createSourceFile(path, source, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
  const found: string[] = [];
  function visit(node: ts.Node): void {
    const text = ts.isJsxText(node)
      ? node.text.trim()
      : ts.isJsxExpression(node) && node.expression && ts.isStringLiteralLike(node.expression)
        ? node.expression.text.trim()
        : ts.isJsxAttribute(node) &&
            ["title", "placeholder", "alt", "aria-label"].includes(node.name.getText(tree)) &&
            node.initializer &&
            ts.isStringLiteral(node.initializer)
          ? node.initializer.text.trim()
          : "";
    if (text)
      found.push(
        `${path}:${tree.getLineAndCharacterOfPosition(node.getStart(tree)).line + 1}: ${text}`,
      );
    ts.forEachChild(node, visit);
  }
  visit(tree);
  return found;
}
it("detects JSX text, string expressions and accessible text attributes", () => {
  expect(
    literals('<div title="Title">Literal text<span>{"More text"}</span></div>', "fixture.tsx"),
  ).toHaveLength(3);
});
it("keeps literal UI strings out of app, features and shared components (CA8)", () => {
  const paths = ["src/app", "src/features", "src/components"].flatMap(files);
  expect(paths.length).toBeGreaterThan(0);
  expect(paths.flatMap((path) => literals(readFileSync(path, "utf8"), path))).toEqual([]);
});
