// Run after `npm run build`: the publications page must list every entry in
// content/cv.yaml "Publications & Papers" — a dropped paper fails the count.
import fs from "node:fs";
import YAML from "yaml";

const doc = YAML.parse(fs.readFileSync("content/cv.yaml", "utf8"));
const want = doc.cv.sections["Publications & Papers"].length;
const html = fs.readFileSync("out/publications/index.html", "utf8");
const got = (html.match(/<div data-pub/g) ?? []).length;
if (got !== want) {
  console.error(`publications page lists ${got} entries, cv.yaml has ${want}`);
  process.exit(1);
}
console.log(`ok: ${got} publications rendered`);
