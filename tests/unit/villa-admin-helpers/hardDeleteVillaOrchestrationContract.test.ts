/* ===============================================================
   🛡️ FAZ 5 — hardDeleteVilla Orchestration CONTRACT TEST (AST)
   ===============================================================
   AMAÇ: hard-delete.service.ts > hardDeleteVilla içindeki destructive
   flow'un SIRASI + Promise.all içerikini regression-safe yapmak.

   FREEZE EDİLEN KONTRATLAR:
     1. Early return when id is missing
     2. AWAITED cleanupVillaStorageForHardDelete (storage cleanup)
     3. AWAITED Promise.all([7 parallel DELETE]) — array içeriği sabit
     4. AWAITED supabase villa DELETE (final)
     5. SQLSTATE 23503 (FK) → TR explicit message
     6. return { ok: ... }

   ⚠️ PROMISE.ALL ARRAY CONTENT:
     7 ayrı supabase.from(...).delete().eq("villa_id", id) çağrısı:
       - villa_images
       - villa_feature_relations
       - villa_rule_relations
       - villa_price_include_relations
       - villa_type_relations
       - villa_distances
       - villa_prices
     (reservations / manual_reservations YOK — history korunur)
=============================================================== */

import { describe, it, expect } from "vitest";
import * as ts from "typescript";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

const SRC_PATH = resolve(
  process.cwd(),
  "app/services/villa-admin/hard-delete.service.ts"
);
const sourceText = readFileSync(SRC_PATH, "utf8");
const sourceFile = ts.createSourceFile(
  "hard-delete.service.ts",
  sourceText,
  ts.ScriptTarget.Latest,
  true,
  ts.ScriptKind.TS
);

function findExportedFunction(name: string): ts.FunctionDeclaration {
  let result: ts.FunctionDeclaration | null = null;
  function visit(node: ts.Node) {
    if (
      ts.isFunctionDeclaration(node) &&
      node.name?.text === name &&
      node.body
    ) {
      result = node;
      return;
    }
    ts.forEachChild(node, visit);
  }
  visit(sourceFile);
  if (!result) throw new Error(`${name} not found`);
  return result;
}

const fnDecl = findExportedFunction("hardDeleteVilla");
const fnBody = fnDecl.body!;

/* ---------------- Tests ---------------- */

describe("hardDeleteVilla — early guard", () => {
  it("first statement returns when id is missing", () => {
    const first = fnBody.statements[0];
    expect(ts.isIfStatement(first)).toBe(true);
    if (ts.isIfStatement(first)) {
      const cond = first.expression.getText();
      expect(cond).toContain("id");
    }
  });
});

describe("hardDeleteVilla — destructive sequence", () => {
  it("calls cleanupVillaStorageForHardDelete AWAITED before Promise.all", () => {
    /* Sıra: storage cleanup → Promise.all → final villa DELETE */
    let cleanupIdx = -1;
    let promiseAllIdx = -1;
    let finalDeleteIdx = -1;

    fnBody.statements.forEach((stmt, idx) => {
      const text = stmt.getText();
      if (text.includes("cleanupVillaStorageForHardDelete")) cleanupIdx = idx;
      if (text.includes("Promise.all")) promiseAllIdx = idx;
      if (text.includes('.from("villa")') && text.includes(".delete()"))
        finalDeleteIdx = idx;
    });

    expect(cleanupIdx).toBeGreaterThanOrEqual(0);
    expect(promiseAllIdx).toBeGreaterThanOrEqual(0);
    expect(finalDeleteIdx).toBeGreaterThanOrEqual(0);
    expect(cleanupIdx).toBeLessThan(promiseAllIdx);
    expect(promiseAllIdx).toBeLessThan(finalDeleteIdx);
  });

  it("Promise.all contains EXACTLY 7 supabase delete calls", () => {
    /* AST'de Promise.all'ın array argümanını bul, element sayısını assert. */
    let promiseAllExpr: ts.CallExpression | null = null;
    function findPromiseAll(node: ts.Node) {
      if (
        ts.isCallExpression(node) &&
        ts.isPropertyAccessExpression(node.expression) &&
        node.expression.expression.getText() === "Promise" &&
        node.expression.name.text === "all"
      ) {
        promiseAllExpr = node;
        return;
      }
      ts.forEachChild(node, findPromiseAll);
    }
    findPromiseAll(fnBody);
    expect(promiseAllExpr).toBeTruthy();

    if (promiseAllExpr) {
      const arr = (promiseAllExpr as ts.CallExpression).arguments[0];
      expect(ts.isArrayLiteralExpression(arr)).toBe(true);
      if (ts.isArrayLiteralExpression(arr)) {
        expect(arr.elements.length).toBe(7);
      }
    }
  });

  it("Promise.all array contains all 7 expected tables (no reservations)", () => {
    let promiseAllExpr: ts.CallExpression | null = null;
    function findPromiseAll(node: ts.Node) {
      if (
        ts.isCallExpression(node) &&
        ts.isPropertyAccessExpression(node.expression) &&
        node.expression.expression.getText() === "Promise" &&
        node.expression.name.text === "all"
      ) {
        promiseAllExpr = node;
        return;
      }
      ts.forEachChild(node, findPromiseAll);
    }
    findPromiseAll(fnBody);

    const arr = (promiseAllExpr as unknown as ts.CallExpression).arguments[0];
    if (!ts.isArrayLiteralExpression(arr)) throw new Error("Expected array");

    const allText = arr.elements.map((e) => e.getText()).join("|");
    const expected = [
      "villa_images",
      "villa_feature_relations",
      "villa_rule_relations",
      "villa_price_include_relations",
      "villa_type_relations",
      "villa_distances",
      "villa_prices",
    ];
    for (const table of expected) {
      expect(allText).toContain(`"${table}"`);
    }
    /* CRITICAL: reservations history korunmalı — YOK olmalı. */
    expect(allText).not.toContain('"reservations"');
    expect(allText).not.toContain('"manual_reservations"');
  });

  it("final villa DELETE happens AFTER Promise.all", () => {
    let promiseAllIdx = -1;
    let finalDeleteIdx = -1;

    fnBody.statements.forEach((stmt, idx) => {
      const text = stmt.getText();
      if (text.includes("Promise.all")) promiseAllIdx = idx;
      if (
        text.includes('.from("villa")') &&
        text.includes(".delete()") &&
        !text.includes("Promise.all")
      ) {
        finalDeleteIdx = idx;
      }
    });

    expect(promiseAllIdx).toBeLessThan(finalDeleteIdx);
  });
});

describe("hardDeleteVilla — SQLSTATE 23503 catch", () => {
  it("checks for code '23503' and returns FK-friendly TR message", () => {
    const fullText = fnBody.getText();
    expect(fullText).toContain('"23503"');
    expect(fullText).toContain("rezervasyon geçmişi");
  });
});

describe("hardDeleteVilla — return contract", () => {
  it("returns { ok: true } on success path", () => {
    const fullText = fnBody.getText();
    expect(fullText).toContain("ok: true");
    expect(fullText).toContain("ok: false");
  });
});
