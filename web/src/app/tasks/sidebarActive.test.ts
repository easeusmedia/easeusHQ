import { test } from "node:test";
import assert from "node:assert/strict";
import { isActive } from "./sidebarActive.ts";

const BASE = "/tasks";

test("Board only lights up on /tasks itself, never on a sub-page", () => {
  assert.equal(isActive("", "/tasks", BASE), true);
  // the bug this guards: "" makes href === base, which is a prefix of every
  // other route, so a careless startsWith would light Board up everywhere
  assert.equal(isActive("", "/tasks/clients", BASE), false);
  assert.equal(isActive("", "/tasks/my", BASE), false);
});

test("a nav item stays lit on its own sub-pages", () => {
  assert.equal(isActive("/clients", "/tasks/clients", BASE), true);
  assert.equal(isActive("/clients", "/tasks/clients/client-elle-sera", BASE), true);
  assert.equal(isActive("/my", "/tasks/my", BASE), true);
});

test("Clients stays lit on a project, which is reached from a client", () => {
  assert.equal(isActive("/clients", "/tasks/projects/abc-123", BASE), true);
});

test("a sibling route whose name merely starts the same does not count", () => {
  // /tasks/my-notes must not light up My Tasks (/tasks/my)
  assert.equal(isActive("/my", "/tasks/my-notes", BASE), false);
  assert.equal(isActive("/chat", "/tasks/chatter", BASE), false);
});

test("items don't light up for each other", () => {
  assert.equal(isActive("/history", "/tasks/clients", BASE), false);
  assert.equal(isActive("/clients", "/tasks/calendar", BASE), false);
});

test("the client panel belongs to the Clients dashboard and each client's page, nowhere else", async () => {
  const { CLIENTS_SECTION } = await import("./clients/clientsPanel.ts");
  assert.equal(CLIENTS_SECTION.test("/tasks/clients"), true);
  assert.equal("/tasks/clients/client-courageous-leaders".match(CLIENTS_SECTION)?.[1], "client-courageous-leaders");
  assert.equal(CLIENTS_SECTION.test("/tasks/clients/abc/projects"), false);
  assert.equal(CLIENTS_SECTION.test("/tasks/clientsx"), false);
  assert.equal(CLIENTS_SECTION.test("/tasks"), false);
});
