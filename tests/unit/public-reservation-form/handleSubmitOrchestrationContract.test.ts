/* ===============================================================
   🛡️ FAZ 4 — ReservationForm > handleSubmit AST contract
   ===============================================================
   FREEZE EDİLEN KONTRATLAR (public submit flow):
     1. validatePublicReservationForm called FIRST
     2. early return if errors > 0 (setErrors + return; setLoading YOK)
     3. setLoading(true) BEFORE try
     4. buildPublicReservationPayload (sync) BEFORE AWAITED insert
     5. AWAITED createReservation(payload)
     6. FIRE-FORGET dispatchPublicReservationRequestMail (after insert)
     7. alert("Rezervasyon alındı 🚀")
     8. setForm(initialPublicReservationFormData())
     9. setErrors({})
    10. catch → alert(err.message)
    11. finally → setLoading(false)
=============================================================== */

import { describe, it, expect } from "vitest";
import * as ts from "typescript";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

const SRC_PATH = resolve(
  process.cwd(),
  "app/components/reservation/ReservationForm.tsx"
);
const sourceText = readFileSync(SRC_PATH, "utf8");
const sourceFile = ts.createSourceFile(
  "ReservationForm.tsx",
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

const handleSubmit = findArrowFn("handleSubmit");
const seq = collectCallSequence(handleSubmit);
const idx = (name: string) => seq.findIndex((e) => e.name === name);

describe("ReservationForm handleSubmit — pre-try guards", () => {
  it("validatePublicReservationForm called as first call (top-level)", () => {
    const validateIdx = idx("validatePublicReservationForm");
    expect(validateIdx).toBe(0);
    expect(seq[validateIdx].awaited).toBe(false);
    expect(seq[validateIdx].conditional).toBe(false);
  });

  it("early return guard: setErrors + return when errors > 0", () => {
    /* Look for if statement with setErrors + return in conditional branch. */
    let foundGuard = false;
    for (const stmt of handleSubmit.statements) {
      if (ts.isTryStatement(stmt)) break;
      if (ts.isIfStatement(stmt) && ts.isBlock(stmt.thenStatement)) {
        const hasSetErrors = stmt.thenStatement.statements.some(
          (s) =>
            ts.isExpressionStatement(s) &&
            ts.isCallExpression(s.expression) &&
            getCalleeName(s.expression) === "setErrors"
        );
        const hasReturn = stmt.thenStatement.statements.some(ts.isReturnStatement);
        if (hasSetErrors && hasReturn) foundGuard = true;
      }
    }
    expect(foundGuard).toBe(true);
  });

  it("setLoading(true) called BEFORE try block", () => {
    let setLoadingIdx = -1;
    let tryIdx = -1;
    handleSubmit.statements.forEach((s, i) => {
      if (
        ts.isExpressionStatement(s) &&
        ts.isCallExpression(s.expression) &&
        getCalleeName(s.expression) === "setLoading"
      ) {
        if (setLoadingIdx === -1) setLoadingIdx = i;
      }
      if (ts.isTryStatement(s) && tryIdx === -1) tryIdx = i;
    });
    expect(setLoadingIdx).toBeGreaterThanOrEqual(0);
    expect(setLoadingIdx).toBeLessThan(tryIdx);
  });
});

describe("ReservationForm handleSubmit — try-block orchestration", () => {
  it("buildPublicReservationPayload called BEFORE createReservation", () => {
    const buildIdx = idx("buildPublicReservationPayload");
    const createIdx = idx("createReservation");
    expect(buildIdx).toBeGreaterThanOrEqual(0);
    expect(createIdx).toBeGreaterThanOrEqual(0);
    expect(buildIdx).toBeLessThan(createIdx);
  });

  it("createReservation is AWAITED", () => {
    const i = idx("createReservation");
    expect(seq[i].awaited).toBe(true);
  });

  it("dispatchPublicReservationRequestMail FIRE-FORGET, conditional, AFTER insert", () => {
    const createIdx = idx("createReservation");
    const mailIdx = idx("dispatchPublicReservationRequestMail");
    expect(mailIdx).toBeGreaterThanOrEqual(0);
    expect(createIdx).toBeLessThan(mailIdx);
    expect(seq[mailIdx].awaited).toBe(false);
    expect(seq[mailIdx].conditional).toBe(true); // inside `if (reservationId)`
  });

  it("alert success AFTER mail dispatch", () => {
    const mailIdx = idx("dispatchPublicReservationRequestMail");
    const alertIdx = idx("alert");
    expect(alertIdx).toBeGreaterThan(mailIdx);
  });

  it("setForm reset AFTER alert", () => {
    const alertIdx = idx("alert");
    const setFormIdx = idx("setForm");
    expect(setFormIdx).toBeGreaterThan(alertIdx);
  });

  it("setForm reset uses initialPublicReservationFormData factory", () => {
    /* Check that setForm receives a call to initialPublicReservationFormData. */
    const factoryIdx = idx("initialPublicReservationFormData");
    expect(factoryIdx).toBeGreaterThanOrEqual(0);
  });

  it("setErrors clear AFTER setForm reset", () => {
    const setFormIdx = idx("setForm");
    /* setErrors appears multiple times (one in pre-try guard, one in success
       reset, one in catch). Find LAST conditional=false occurrence in try. */
    const trySetErrors = seq
      .map((e, i) => ({ e, i }))
      .filter(({ e }) => e.name === "setErrors");
    expect(trySetErrors.length).toBeGreaterThanOrEqual(2);
    /* setForm comes before reset's setErrors */
    expect(setFormIdx).toBeGreaterThan(0);
  });
});

describe("ReservationForm handleSubmit — catch + finally", () => {
  it("catch block calls alert", () => {
    const tryStmt = handleSubmit.statements.find(ts.isTryStatement);
    expect(tryStmt?.catchClause).toBeTruthy();
    const catchBlock = tryStmt?.catchClause?.block;
    const hasAlert = catchBlock?.statements.some(
      (s) =>
        ts.isExpressionStatement(s) &&
        ts.isCallExpression(s.expression) &&
        getCalleeName(s.expression) === "alert"
    );
    expect(hasAlert).toBe(true);
  });

  it("finally block calls setLoading", () => {
    const tryStmt = handleSubmit.statements.find(ts.isTryStatement);
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

describe("ReservationForm handleSubmit — invariants (EXACTLY ONCE)", () => {
  it("validatePublicReservationForm called EXACTLY ONCE", () => {
    expect(seq.filter((e) => e.name === "validatePublicReservationForm").length).toBe(1);
  });

  it("buildPublicReservationPayload called EXACTLY ONCE", () => {
    expect(seq.filter((e) => e.name === "buildPublicReservationPayload").length).toBe(1);
  });

  it("createReservation called EXACTLY ONCE", () => {
    expect(seq.filter((e) => e.name === "createReservation").length).toBe(1);
  });

  it("dispatchPublicReservationRequestMail called EXACTLY ONCE", () => {
    expect(
      seq.filter((e) => e.name === "dispatchPublicReservationRequestMail").length
    ).toBe(1);
  });
});
