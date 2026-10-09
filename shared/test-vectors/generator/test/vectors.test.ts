import { readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { buildAllVectors, toJsonText } from "../src/vectors.js";

const VECTORS_DIR = fileURLToPath(new URL("../../vectors/", import.meta.url));

describe("committed vector files", () => {
  it("are up to date with the reference implementation (run `npm run generate` if this fails)", async () => {
    const vectors = await buildAllVectors();
    for (const [fileName, data] of Object.entries(vectors)) {
      const committed = await readFile(`${VECTORS_DIR}${fileName}`, "utf8");
      expect(committed, fileName).toBe(toJsonText(data));
    }
  });
});
