const fs = require("fs");
const path = require("path");

const root = path.resolve("src");
const extensions = [".js", ".jsx", ".ts", ".tsx"];
const files = [];

function walk(dir) {
  for (const item of fs.readdirSync(dir, { withFileTypes: true })) {
    const p = path.join(dir, item.name);
    if (item.isDirectory()) walk(p);
    else if (extensions.includes(path.extname(p))) files.push(p);
  }
}

function resolveImport(from, spec) {
  if (!spec.startsWith(".")) return null;
  const base = path.resolve(path.dirname(from), spec);
  for (const p of [base, ...extensions.map(e => base + e),
    ...extensions.map(e => path.join(base, "index" + e))]) {
    if (fs.existsSync(p) && fs.statSync(p).isFile()) return p;
  }
  return null;
}

function exportsOf(source) {
  const names = new Set();
  const re = /\bexport\s+(?:declare\s+)?(?:async\s+)?(?:function|class|const|let|var|enum|interface|type)\s+([A-Za-z_$][\w$]*)/g;
  let m;
  while ((m = re.exec(source))) names.add(m[1]);

  for (const block of source.matchAll(/\bexport\s*\{([^}]+)\}(?:\s*from\s*["'][^"']+["'])?/g)) {
    for (const part of block[1].split(",")) {
      const n = part.trim().split(/\s+as\s+/).pop();
      if (n && n !== "type") names.add(n.trim());
    }
  }
  if (/\bexport\s+default\b/.test(source)) names.add("default");
  return names;
}

walk(root);
const issues = [];
const unresolved = [];

for (const file of files) {
  const source = fs.readFileSync(file, "utf8");
  const re = /\bimport\s+(?!\s*type\b)([\s\S]*?)\s+from\s*["']([^"']+)["']/g;
  let m;

  while ((m = re.exec(source))) {
    const clause = m[1].trim();
    const spec = m[2];
    if (!spec.startsWith(".")) continue;

    const target = resolveImport(file, spec);
    if (!target) {
      unresolved.push(`${path.relative(root, file)} -> ${spec}`);
      continue;
    }

    const targetSource = fs.readFileSync(target, "utf8");
    const available = exportsOf(targetSource);
    const named = clause.match(/\{([^}]+)\}/);

    if (named) {
      for (const part of named[1].split(",")) {
        const bits = part.trim().split(/\s+as\s+/);
        const imported = bits[0].replace(/^type\s+/, "").trim();
        if (imported && !available.has(imported)) {
          issues.push(`${path.relative(root, file)} imports "${imported}" from ${path.relative(root, target)}`);
        }
      }
    }
  }
}

const output = [
  "ANWE-STUDIO IMPORT/EXPORT AUDIT",
  `Scanned ${files.length} source files.`,
  "",
  "POSSIBLE MISSING NAMED EXPORTS:",
  ...(issues.length ? [...new Set(issues)] : ["None detected by the basic scanner."]),
  "",
  "UNRESOLVED RELATIVE IMPORT PATHS:",
  ...(unresolved.length ? [...new Set(unresolved)] : ["None detected."]),
  "",
  "Note: TypeScript re-exports, dynamic imports and complex syntax may need manual verification."
].join("\r\n");

fs.writeFileSync(process.env.REPAIR_REPORT, output, "utf8");
console.log(output);
