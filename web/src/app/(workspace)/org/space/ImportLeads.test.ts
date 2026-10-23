import { test } from "node:test";
import assert from "node:assert/strict";
import { resolve } from "node:path";
import { createJiti } from "jiti";
import { partsOf, type Part } from "../../../../lib/leadImport.ts";

// the dialog's pure helpers, from the component file itself (jiti reads its JSX and "@/" paths)
const jiti = createJiti(import.meta.url, { alias: { "@": resolve(import.meta.dirname, "../../../..") }, jsx: true });
const { batchesOf, leftOut, pasted, readParts, together, unsent } = await jiti.import<typeof import("./ImportLeads.tsx")>("./ImportLeads.tsx");

test("several screenshots are read together, two a call, beside a file's rows", () => {
  const img = "data:image/jpeg;base64,AAAA";
  const { rows, loose } = together([{ text: "", images: [img] }, { rows: [{ Clinic: "Glow" }] }, { text: "", images: [img] }]);
  assert.deepEqual(rows, [{ Clinic: "Glow" }]);
  assert.deepEqual(partsOf(loose!), [{ images: [img, img] }]);
  assert.equal(together([{ rows: [] }]).loose, null);
});

test("cells pasted from a spreadsheet are a table; a picture alone is itself", () => {
  const shot = new File(["x"], "image.png", { type: "image/png" });
  const names = (text: string, files: File[] = []) => pasted(text, files).map((f) => f.name);
  // Excel and Numbers copy a picture of the cells too: the cells are read, without Claude
  assert.deepEqual(names("Clinic\tEmail\nGlow\tg@glow.com\n", [shot]), ["pasted.tsv"]);
  assert.deepEqual(names("Glow Clinic, g@glow.com\nSkin Lab, s@lab.com"), ["pasted.txt"]);
  assert.deepEqual(names("Clinic\tEmail"), ["pasted.txt"]);
  assert.deepEqual(names("", [shot]), ["image.png"]);
  assert.deepEqual(names("image.png", [shot]), ["image.png"]);
  assert.deepEqual(names("  \n"), []);
});

const lines = (p: Part) => p.text!.split("\n").length;
const four = (tag: string) => ({ text: [1, 2, 3, 4].map((n) => `${tag}${n}`).join("\n") });

test("nothing more is asked of Claude once the dialog is closed", async () => {
  let open = true;
  const asked: string[] = [];
  const rows = await readParts(
    [{ text: "a" }, { text: "b" }, { text: "c" }],
    async (p) => {
      asked.push(p.text!);
      open = false; // closed while the first part was being read
      return { rows: [{ title: p.text }] };
    },
    () => !open,
    () => {},
  );
  assert.deepEqual(asked, ["a"]);
  assert.deepEqual(rows, [{ title: "a" }]);
});

test("once a part overflows, every part after it goes already halved", async () => {
  const asked: number[] = [];
  // more than three lines is more than an answer holds
  await readParts([four("a"), four("b")], async (p) => (asked.push(lines(p)), lines(p) > 3 ? { tooLong: true } : { rows: [] }), () => false, () => {});
  // a: whole (cut off), then its halves; b: only ever its halves
  assert.deepEqual(asked, [4, 2, 2, 2, 2]);
});

test("new leads never go with allow_duplicates; after a failed call only what didn't go in is left", () => {
  const leads = Array.from({ length: 120 }, (_, i) => ({ title: `Lead ${i}` }));
  const dups = [{ title: "Already Here" }];
  const batches = batchesOf(leads, dups);
  assert.deepEqual(
    batches.map((b) => [b.leads.length, b.twice]),
    [
      [50, false],
      [50, false],
      [20, false],
      [1, true],
    ],
  );
  // the second call failed; in the first, add_leads turned down "Lead 3" (it trims a title's spaces)
  const rest = unsent(batches, 1, new Set(["Lead 3"]));
  assert.deepEqual(
    rest.leads.map((l) => l.title),
    ["Lead 3", ...leads.slice(50).map((l) => l.title)],
  );
  assert.deepEqual(rest.duplicates, dups);
  assert.deepEqual(unsent(batchesOf([{ title: " Lead  9 " }], []), 1, new Set(["Lead 9"])).leads, [{ title: " Lead  9 " }]);
  // everything went in: nothing left
  assert.deepEqual(unsent(batches, batches.length, new Set()), { leads: [], duplicates: [] });
});

test("without Claude's placing, the columns left out are named", () => {
  assert.equal(leftOut("Claude is busy right now.", ["City", "Notes"]), "Claude is busy right now. Importing now leaves out City and Notes.");
  assert.equal(leftOut("Claude is busy right now.", ["a", "b", "c", "d", "e"]), "Claude is busy right now. Importing now leaves out a, b, c and 2 more.");
});
