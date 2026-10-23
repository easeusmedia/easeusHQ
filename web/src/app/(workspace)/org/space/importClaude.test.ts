import { test } from "node:test";
import assert from "node:assert/strict";
import { describe, rowsOf } from "./importClaude.ts";
import type { FieldData } from "../../../../lib/space.ts";

const tags = (...names: string[]) => names.map((name, i) => ({ id: `o${i + 1}`, name, color: "blue" }));
const field = (name: string, kind: FieldData["kind"], options = tags()): FieldData => ({ id: name, name, kind, onCard: false, required: false, options });

test("Claude sees every tag, so the 11th country is never answered with the nearest listed one", () => {
  const countries = ["USA", "UK", "India", "UAE", "Canada", "Australia", "Germany", "France", "Spain", "Italy", "South Korea", "Japan", "Brazil", "Malaysia", "Colombia"];
  const said = describe({ fields: [field("Contacts", "contacts"), field("Country", "select", tags(...countries))], messages: [] });
  for (const c of ["South Korea", "Malaysia", "Colombia"]) assert.match(said, new RegExp(`tags: .*${c}`));
  assert.doesNotMatch(said, /Contacts/);
  // still capped, for a board with a runaway list
  const many = describe({ fields: [field("Tag", "multi", tags(...Array.from({ length: 80 }, (_, i) => `t${i}`)))], messages: [] });
  assert.match(many, /t59\)/);
  assert.doesNotMatch(many, /t60/);
});

test("two values for one property are both kept, a repeat once", () => {
  const [row] = rowsOf([
    {
      title: "Hale Aesthetics",
      contacts: [{ name: "Tom Hale", email: "tom@haleaesthetics.com, bookings@haleaesthetics.com" }],
      links: [],
      values: [
        { field: "To check", value: "Find first name" },
        { field: "To check", value: "Check description" },
        { field: "To check", value: "Find first name" },
        { field: "Country", value: "Ireland" },
      ],
      vars: [{ name: "First name", value: "Tom" }],
    },
  ]);
  assert.deepEqual(row, {
    title: "Hale Aesthetics",
    contacts: [{ name: "Tom Hale", email: "tom@haleaesthetics.com, bookings@haleaesthetics.com" }],
    links: [],
    "To check": "Find first name, Check description",
    Country: "Ireland",
    "{{First name}}": "Tom",
  });
});
