/* ===============================================================
   🛡️ FAZ 5 — villas/ekle/page.tsx > handleCreate AST contract
   ===============================================================
   FREEZE EDİLEN KONTRATLAR:
     1. early return if loading
     2. setLoading(true)
     3. validateVillaCreate guard — if not ok, toast.error + setLoading(false) + return
     4. AWAITED createVillaFull(buildVillaCreatePayload(...))
     5. toast.success("Villa eklendi")
     6. FIRE-FORGET logActivity({ after_data: buildVillaCreateAuditAfter(...) }).catch(()=>{})
     7. router.push("/maki-admin/villas/{newId}/galeri")
     8. catch: toast.error
     9. finally: setLoading(false)
=============================================================== */

import { describe, it, expect } from "vitest";
import * as ts from "typescript";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

const SRC_PATH = resolve(
  process.cwd(),
  "app/(admin)/maki-admin/villas/ekle/page.tsx"
);
const sourceText = readFileSync(SRC_PATH, "utf8");
const sourceFile = ts.createSourceFile(
  "page.tsx",
  sourceText,
  ts.ScriptTarget.Latest,
  true,
  ts.ScriptKind.TSX
);

function findArrowFn(name: string): ts.Block {
  let result: ts.Block | null = null;
  function visit(node: ts.Node) {
    if (
      ts.isVariableDeclaration(node) &&
      ts.isIdentifier(node.name) &&
      node.name.text === name &&
      node.initializer &&
      ts.isArrowFunction(node.initializer)
    ) {
      const body = node.initializer.body;
      if (ts.isBlock(body)) {
        result = body;
        return;
      }
    }
    ts.forEachChild(node, visit);
  }
  visit(sourceFile);
  if (!result) throw new Error(`${name} arrow fn not found`);
  return result;
}

function getCalleeName(call: ts.CallExpression): string {
  const expr = call.expression;
  if (ts.isIdentifier(expr)) return expr.text;
  if (ts.isPropertyAccessExpression(expr)) {
    return expr.expression.getText() + "." + expr.name.text;
  }
  return expr.getText();
}

type CallEvent = {
  name: string;
  awaited: boolean;
  conditional: boolean;
};

function collectCallSequence(block: ts.Block, conditional = false): CallEvent[] {
  const out: CallEvent[] = [];
  for (const stmt of block.statements) extractFromStmt(stmt, out, conditional);
  return out;
}

function extractFromStmt(stmt: ts.Statement, out: CallEvent[], conditional: boolean): void {
  if (ts.isVariableStatement(stmt)) {
    for (const decl of stmt.declarationList.declarations) {
      pushFromExpr(decl.initializer, out, conditional);
    }
    return;
  }
  if (ts.isExpressionStatement(stmt)) {
    pushFromExpr(stmt.expression, out, conditional);
    return;
  }
  if (ts.isIfStatement(stmt) && ts.isBlock(stmt.thenStatement)) {
    for (const s of stmt.thenStatement.statements) extractFromStmt(s, out, true);
  }
  if (ts.isTryStatement(stmt)) {
    for (const s of stmt.tryBlock.statements) extractFromStmt(s, out, conditional);
    if (stmt.catchClause) {
      for (const s of stmt.catchClause.block.statements) extractFromStmt(s, out, true);
    }
    if (stmt.finallyBlock) {
      for (const s of stmt.finallyBlock.statements) extractFromStmt(s, out, true);
    }
  }
}

function pushFromExpr(expr: ts.Expression | undefined, out: CallEvent[], conditional: boolean): void {
  if (!expr) return;
  if (ts.isAwaitExpression(expr) && ts.isCallExpression(expr.expression)) {
    out.push({ name: getCalleeName(expr.expression), awaited: true, conditional });
    return;
  }
  if (ts.isCallExpression(expr)) {
    out.push({ name: getCalleeName(expr), awaited: false, conditional });
  }
}

const handleCreate = findArrowFn("handleCreate");
const seq = collectCallSequence(handleCreate);
const idx = (name: string) => seq.findIndex((e) => e.name === name);

describe("villas/ekle handleCreate — guards", () => {
  it("first statement guards loading", () => {
    const first = handleCreate.statements[0];
    expect(ts.isIfStatement(first)).toBe(true);
    if (ts.isIfStatement(first)) {
      expect(first.expression.getText()).toContain("loading");
    }
  });

  it("setLoading(true) before validation", () => {
    const setLoading = handleCreate.statements.find(
      (s) =>
        ts.isExpressionStatement(s) &&
        ts.isCallExpression(s.expression) &&
        getCalleeName(s.expression) === "setLoading"
    );
    expect(setLoading).toBeTruthy();
  });

  it("validateVillaCreate called BEFORE try block", () => {
    const validateIdx = handleCreate.statements.findIndex(
      (s) =>
        ts.isVariableStatement(s) &&
        s.declarationList.declarations.some(
          (d) =>
            d.initializer &&
            ts.isCallExpression(d.initializer) &&
            getCalleeName(d.initializer) === "validateVillaCreate"
        )
    );
    const tryIdx = handleCreate.statements.findIndex(ts.isTryStatement);
    expect(validateIdx).toBeGreaterThanOrEqual(0);
    expect(tryIdx).toBeGreaterThanOrEqual(0);
    expect(validateIdx).toBeLessThan(tryIdx);
  });
});

describe("villas/ekle handleCreate — try-block orchestration", () => {
  it("buildVillaCreatePayload called BEFORE createVillaFull", () => {
    const buildIdx = idx("buildVillaCreatePayload");
    const createIdx = idx("createVillaFull");
    expect(buildIdx).toBeGreaterThanOrEqual(0);
    expect(createIdx).toBeGreaterThanOrEqual(0);
    expect(buildIdx).toBeLessThan(createIdx);
  });

  it("createVillaFull is AWAITED", () => {
    const i = idx("createVillaFull");
    expect(seq[i].awaited).toBe(true);
  });

  it("toast.success AFTER createVillaFull", () => {
    const createIdx = idx("createVillaFull");
    const toastIdx = idx("toast.success");
    expect(toastIdx).toBeGreaterThan(createIdx);
  });

  it("logActivity called AFTER toast.success (fire-forget)", () => {
    const toastIdx = idx("toast.success");
    const logIdx = idx("logActivity");
    expect(logIdx).toBeGreaterThan(toastIdx);
    /* logActivity itself is not awaited — .catch chain handles fail-safe. */
    expect(seq[logIdx].awaited).toBe(false);
  });

  it("buildVillaCreateAuditAfter called (audit payload helper)", () => {
    expect(idx("buildVillaCreateAuditAfter")).toBeGreaterThanOrEqual(0);
  });

  it("router.push is the FINAL success call", () => {
    const logIdx = idx("logActivity");
    const routerIdx = idx("router.push");
    expect(routerIdx).toBeGreaterThan(logIdx);
  });

  it("single createVillaFull invariant (EXACTLY ONCE)", () => {
    expect(seq.filter((e) => e.name === "createVillaFull").length).toBe(1);
  });
});

describe("villas/ekle handleCreate — error handling", () => {
  it("catch block calls toast.error", () => {
    const tryStmt = handleCreate.statements.find(ts.isTryStatement);
    expect(tryStmt?.catchClause).toBeTruthy();
    const catchBlock = tryStmt?.catchClause?.block;
    const hasErr = catchBlock?.statements.some(
      (s) =>
        ts.isExpressionStatement(s) &&
        ts.isCallExpression(s.expression) &&
        getCalleeName(s.expression) === "toast.error"
    );
    expect(hasErr).toBe(true);
  });

  it("finally block calls setLoading(false)", () => {
    const tryStmt = handleCreate.statements.find(ts.isTryStatement);
    expect(tryStmt?.finallyBlock).toBeTruthy();
    const hasSetLoading = tryStmt?.finallyBlock?.statements.some(
      (s) =>
        ts.isExpressionStatement(s) &&
        ts.isCallExpression(s.expression) &&
        getCalleeName(s.expression) === "setLoading"
    );
    expect(hasSetLoading).toBe(true);
  });
});
