import { readdir, readFile } from "node:fs/promises";
import ts from "typescript";

const forbiddenTags = new Set([
  "button",
  "input",
  "select",
  "textarea",
  "option",
  "optgroup",
  "form",
  "label",
  "fieldset",
  "dialog",
  "details",
  "summary",
  "table",
  "thead",
  "tbody",
  "tfoot",
  "tr",
  "td",
  "th",
  "a",
]);
const forbiddenImports =
  /^(react-native(?:\/|$)|react-native-web(?:\/|$)|heroui-native|@heroui-native\/|@radix-ui\/|@mui\/|antd(?:\/|$)|@chakra-ui\/)/;
const failures = [];
async function walk(directory) {
  for (const entry of await readdir(directory, { withFileTypes: true })) {
    const path = `${directory}/${entry.name}`;
    if (entry.isDirectory()) {
      await walk(path);
      continue;
    }
    if (!/\.[cm]?[jt]sx?$/.test(path)) continue;
    const source = ts.createSourceFile(
      path,
      await readFile(path, "utf8"),
      ts.ScriptTarget.Latest,
      true,
      path.endsWith("x") ? ts.ScriptKind.TSX : ts.ScriptKind.TS,
    );
    function fail(node, message) {
      const { line } = source.getLineAndCharacterOfPosition(
        node.getStart(source),
      );
      failures.push(`${path}:${line + 1}: ${message}`);
    }
    function visit(node) {
      if (
        ts.isImportDeclaration(node) &&
        ts.isStringLiteral(node.moduleSpecifier)
      ) {
        const name = node.moduleSpecifier.text;
        if (forbiddenImports.test(name))
          fail(node, `禁止使用 ${name}，请使用 HeroUI Web。`);
        if (name === "@heroui-pro/react")
          fail(node, "HeroUI Pro 必须按子路径导入。");
      }
      if (ts.isJsxOpeningElement(node) || ts.isJsxSelfClosingElement(node)) {
        const tag = node.tagName.getText(source);
        if (forbiddenTags.has(tag))
          fail(node, `请用 HeroUI 替代原生 <${tag}>。`);
        if (
          /^[a-z]/.test(tag) &&
          node.attributes.properties.some(
            (p) =>
              ts.isJsxAttribute(p) &&
              /^on(Click|Key|Pointer|Mouse|Touch)/.test(p.name.getText(source)),
          )
        )
          fail(node, "禁止用原生标签模拟交互控件。");
      }
      ts.forEachChild(node, visit);
    }
    visit(source);
  }
}
await walk("apps/web/src");
if (failures.length) {
  console.error(failures.join("\n"));
  process.exitCode = 1;
} else console.log("HeroUI Web 组件约束检查通过。");
