"use strict";

// Logique PURE de decision d'initiateur DMR (PEaaSrepo/scripts/setup/lib).
// Etant donne deux index et une politique, quel site ouvre la connexion TCP ?
//
//   node --test

const test = require("node:test");
const assert = require("node:assert/strict");
const { execFileSync } = require("node:child_process");
const path = require("node:path");

const SCRIPT = path.resolve(
  __dirname,
  "../../PEaaSrepo/scripts/setup/lib/dmr-initiator.sh"
);

function decide(...args) {
  try {
    return {
      code: 0,
      out: execFileSync("bash", [SCRIPT, ...args.map(String)], { encoding: "utf8" }).trim()
    };
  } catch (e) {
    return { code: e.status ?? 1, out: (e.stdout || "").trim(), err: (e.stderr || "").trim() };
  }
}

test("lowest_index (defaut) : l'index le plus bas ouvre la connexion", () => {
  assert.equal(decide(0, 1).out, "local");
  assert.equal(decide(1, 0).out, "remote");
  assert.equal(decide(2, 5).out, "local");
  assert.equal(decide(5, 2).out, "remote");
  assert.equal(decide(0, 9, "lowest_index").out, "local");
});

test("highest_index : politique inverse", () => {
  assert.equal(decide(0, 1, "highest_index").out, "remote");
  assert.equal(decide(1, 0, "highest_index").out, "local");
  assert.equal(decide(7, 2, "highest_index").out, "local");
});

test("bornes : index 0 et grands index", () => {
  assert.equal(decide(0, 255).out, "local");
  assert.equal(decide(255, 0).out, "remote");
});

test("indices egaux -> none (topologie anormale)", () => {
  assert.equal(decide(3, 3).out, "none");
  assert.equal(decide(0, 0).out, "none");
});

test("arguments invalides -> code 2, rien sur stdout", () => {
  for (const bad of [["x", "1"], ["1"], [], ["1", "y"], ["0", "1", "bidon"], ["-1", "0"]]) {
    const r = decide(...bad);
    assert.equal(r.code, 2, `attendu code 2 pour ${JSON.stringify(bad)}`);
    assert.equal(r.out, "");
  }
});

test("symetrie : les deux sites d'une paire s'accordent sur l'initiateur", () => {
  for (const [a, b] of [[0, 1], [1, 4], [2, 9]]) {
    const vuDeA = decide(a, b).out;
    const vuDeB = decide(b, a).out;
    // l'un ouvre ("local"), l'autre accepte ("remote")
    assert.deepEqual([vuDeA, vuDeB].sort(), ["local", "remote"], `${a} <-> ${b}`);
  }
  assert.equal(decide(3, 3).out, "none");
});
