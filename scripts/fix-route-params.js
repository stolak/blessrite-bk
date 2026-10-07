/**
 * Replaces `const { a, b } = req.params` with routeParam helpers for Express 5 typing.
 */
const fs = require("fs");
const path = require("path");

const controllersDir = path.join(__dirname, "..", "src", "controllers");
const TRIM_PARAM_HANDLERS = new Set([
  "userStoreController.ts",
  "storeController.ts",
]);

function ensureImport(content, needTrim) {
  const names = needTrim ? ["routeParam", "routeParamTrimmed"] : ["routeParam"];
  const importLine = `import { ${names.join(", ")} } from "../utils/request";`;

  if (content.includes('from "../utils/request"')) {
    return content.replace(
      /import\s+\{([^}]+)\}\s+from\s+"\.\.\/utils\/request";/,
      (m, inner) => {
        const existing = inner.split(",").map((s) => s.trim());
        for (const n of names) {
          if (!existing.includes(n)) existing.push(n);
        }
        return `import { ${existing.join(", ")} } from "../utils/request";`;
      }
    );
  }

  const expressImport = content.match(/^import .+ from "express";$/m);
  if (expressImport) {
    return content.replace(expressImport[0], `${expressImport[0]}\n${importLine}`);
  }
  return `${importLine}\n${content}`;
}

function fixFile(filePath) {
  const base = path.basename(filePath);
  const useTrim = TRIM_PARAM_HANDLERS.has(base);
  let content = fs.readFileSync(filePath, "utf8");
  const before = content;

  const destructureRegex = /const\s+\{\s*([^}]+)\s*\}\s*=\s*req\.params\s*;/g;
  let matched = false;

  content = content.replace(destructureRegex, (_, namesRaw) => {
    matched = true;
    const names = namesRaw
      .split(",")
      .map((n) => n.trim())
      .filter(Boolean);
    const fn = useTrim ? "routeParamTrimmed" : "routeParam";
    return names.map((name) => `const ${name} = ${fn}(req.params.${name});`).join("\n      ");
  });

  if (!matched) return false;

  content = ensureImport(content, useTrim);
  if (content !== before) {
    fs.writeFileSync(filePath, content);
    return true;
  }
  return false;
}

const files = fs
  .readdirSync(controllersDir)
  .filter((f) => f.endsWith(".ts"))
  .map((f) => path.join(controllersDir, f));

let count = 0;
for (const file of files) {
  if (fixFile(file)) {
    count++;
    console.log("fixed:", path.basename(file));
  }
}
console.log(`Done. Updated ${count} file(s).`);
