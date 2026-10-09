import { mkdir, writeFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { buildAllVectors, toJsonText } from "./vectors.js";

const VECTORS_DIR = fileURLToPath(new URL("../../vectors/", import.meta.url));

const vectors = await buildAllVectors();
await mkdir(VECTORS_DIR, { recursive: true });

for (const [fileName, data] of Object.entries(vectors)) {
  await writeFile(`${VECTORS_DIR}${fileName}`, toJsonText(data));
  console.log(`wrote vectors/${fileName}`);
}
