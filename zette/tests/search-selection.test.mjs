import assert from "node:assert/strict";
import test from "node:test";

import {
  buildPieceHref,
  navigateSearchResultClick,
  shouldHandleSearchResultNavigation,
} from "../src/lib/search-navigation.ts";

function clickEvent(overrides = {}) {
  const calls = [];

  return {
    event: {
      altKey: false,
      button: 0,
      ctrlKey: false,
      defaultPrevented: false,
      metaKey: false,
      shiftKey: false,
      currentTarget: {
        target: "",
        getAttribute: () => null,
      },
      preventDefault: () => calls.push("preventDefault"),
      ...overrides,
    },
    calls,
  };
}

test("search result href preserves selected piece id and tags", () => {
  assert.equal(
    buildPieceHref("brain:journals:2022_03_23.md:32", ["mw", "money"], "/"),
    "/?tags=mw%2Cmoney&p=brain%3Ajournals%3A2022_03_23.md%3A32",
  );
});

test("plain search result clicks push the selected result before closing search", () => {
  const href = "/?p=brain%3Ajournals%3A2022_03_23.md%3A32";
  const { event, calls } = clickEvent();
  const handled = navigateSearchResultClick(
    event,
    href,
    (nextHref) => calls.push(["push", nextHref]),
    () => calls.push("closeSearch"),
  );

  assert.equal(handled, true);
  assert.deepEqual(calls, [
    "preventDefault",
    ["push", href],
    "closeSearch",
  ]);
});

test("modified result clicks keep normal browser link behavior", () => {
  const { event, calls } = clickEvent({ metaKey: true });
  const handled = navigateSearchResultClick(
    event,
    "/?p=brain%3Ajournals%3A2022_03_23.md%3A32",
    () => calls.push("push"),
    () => calls.push("closeSearch"),
  );

  assert.equal(handled, false);
  assert.deepEqual(calls, []);
  assert.equal(shouldHandleSearchResultNavigation(event), false);
});
