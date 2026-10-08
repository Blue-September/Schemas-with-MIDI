import { readdirSync, writeFileSync } from "node:fs";

const dir = "./public/score";
const files = readdirSync(dir)
	.filter((f) => /\.(xml|musicxml|mxl)$/i.test(f))
	.sort((a, b) => a.localeCompare(b, "zh-Hant"));

writeFileSync(`${dir}/index.json`, JSON.stringify(files, null, 2));
console.log(`score list: ${files.length} files`);
