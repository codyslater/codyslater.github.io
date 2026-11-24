// The contact row (src/components/ui/ContactReveal.tsx) holds the site's contact address as
// shifted character codes, so it is not a plain string in the page or the bundle. The address
// is deliberately NOT read from content/cv.yaml: the site's contact address is its own choice
// and is kept out of the repository in plain form.
//
//   node scripts/check-contact.mjs                      check that the lists decode to a well-formed address
//   node scripts/check-contact.mjs --write --from-file <path>
//                                                       set a new address; <path> is a text file outside
//                                                       the repo whose first non-empty line is the address
//                                                       (a line `email: you@example.org` also works)
//
// It never prints the address.
import { readFileSync, writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const componentPath = join(root, "src/components/ui/ContactReveal.tsx");
const source = readFileSync(componentPath, "utf8");
const shape = /^[^@\s]+@[^@\s]+\.[^@\s.]+$/;

const keyMatch = source.match(/const KEY = (\d+);/);
const listMatch = source.match(/const F: number\[\]\[\] = (\[[\s\S]*?\n\]);/);
if (!keyMatch || !listMatch) {
  console.error("contact: could not find KEY and F in ContactReveal.tsx (did the component change shape?)");
  process.exit(1);
}
const KEY = Number(keyMatch[1]);

// Piece order in the component: user = F[3] + F[1], host = F[2], tld = F[0].
function encode(address) {
  const at = address.lastIndexOf("@");
  const user = address.slice(0, at);
  const domain = address.slice(at + 1);
  const dot = domain.lastIndexOf(".");
  const half = Math.floor(user.length / 2);
  const pieces = [domain.slice(dot + 1), user.slice(half), domain.slice(0, dot), user.slice(0, half)];
  return pieces.map((p) => [...p].map((ch, k) => ch.charCodeAt(0) + k + KEY));
}

function decode(lists) {
  const d = (i) => String.fromCharCode(...lists[i].map((n, k) => n - k - KEY));
  return `${d(3)}${d(1)}@${d(2)}.${d(0)}`;
}

if (process.argv.includes("--write")) {
  const i = process.argv.indexOf("--from-file");
  const file = i > -1 ? process.argv[i + 1] : null;
  if (!file) {
    console.error("contact: --write needs --from-file <path to a text file holding the address>");
    process.exit(1);
  }
  const line = readFileSync(file, "utf8")
    .split("\n")
    .map((l) => l.trim())
    .find((l) => l && !l.startsWith("#"));
  const wanted = (line ?? "").replace(/^email:\s*/, "").replace(/^["']|["']$/g, "");
  if (!shape.test(wanted)) {
    console.error("contact: the file does not hold a well-formed address on its first line");
    process.exit(1);
  }
  const lists = encode(wanted);
  const body = `[\n${lists.map((l) => `  [${l.join(", ")}],`).join("\n")}\n]`;
  writeFileSync(componentPath, source.replace(listMatch[1], body));
  const ok = decode(lists) === wanted;
  console.log(ok ? "contact: rewrote the lists in ContactReveal.tsx" : "contact: rewrite failed its own check");
  process.exit(ok ? 0 : 1);
}

let current = "";
try {
  current = decode(JSON.parse(listMatch[1].replace(/,(\s*\])/g, "$1")));
} catch {
  current = "";
}
if (shape.test(current)) {
  console.log(`contact: ok (the contact row decodes to a well-formed address, ${current.length} characters)`);
  process.exit(0);
}
console.error("contact: the lists in ContactReveal.tsx do not decode to a well-formed address");
process.exit(1);
