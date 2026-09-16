import { test } from "node:test";
import assert from "node:assert/strict";
import { isActive } from "./sidebarActive.ts";

test("a nav item is lit on its own page and its sub-pages", () => {
  assert.equal(isActive("/board", "/board"), true);
  assert.equal(isActive("/clients", "/clients"), true);
  assert.equal(isActive("/clients", "/clients/client-elle-sera"), true);
  assert.equal(isActive("/my-tasks", "/my-tasks"), true);
});

test("Clients stays lit on a project, which is reached from a client", () => {
  assert.equal(isActive("/clients", "/projects/abc-123"), true);
});

test("a sibling route whose name merely starts the same does not count", () => {
  assert.equal(isActive("/chat", "/chatter"), false);
  assert.equal(isActive("/board", "/boardroom"), false);
});

test("items don't light up for each other", () => {
  assert.equal(isActive("/history", "/clients"), false);
  assert.equal(isActive("/clients", "/calendar"), false);
  assert.equal(isActive("/board", "/my-tasks"), false);
});

test("the client panel belongs to the Clients dashboard and each client's page, nowhere else", async () => {
  const { CLIENTS_SECTION } = await import("./clients/clientsPanel.ts");
  assert.equal(CLIENTS_SECTION.test("/clients"), true);
  assert.equal("/clients/client-courageous-leaders".match(CLIENTS_SECTION)?.[1], "client-courageous-leaders");
  assert.equal(CLIENTS_SECTION.test("/clients/abc/projects"), false);
  assert.equal(CLIENTS_SECTION.test("/clientsx"), false);
  assert.equal(CLIENTS_SECTION.test("/board"), false);
});
