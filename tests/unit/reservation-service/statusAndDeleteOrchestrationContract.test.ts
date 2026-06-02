/* ===============================================================
   🛡️ FAZ 5 — updateReservationStatus + deleteReservationById
   Orchestration CONTRACT TESTS (AST; FAZ 33 evolution)
   ===============================================================
   FREEZE EDİLEN KONTRATLAR:

   updateReservationStatus:
     1. throw "ID gerekli" if !id
     2. CONDITIONAL AWAITED assertCanConfirm  (if status==="confirmed")
        — paid_amount argument: undefined (DB fetch fallback)
     3. AWAITED reservationRepository.updateById(id, { status })
        (FAZ 33: önceden `supabase.update({status}).eq("id", id)`)
     4. console.error "❌ Status error:"
     5. throw "Durum güncellenemedi"
     6. return true

   deleteReservationById:
     1. throw "ID gerekli" if !id
     2. AWAITED reservationRepository.deleteById(id)
        (FAZ 33: önceden `supabase.delete().eq("id", id)`)
     3. console.error "❌ Delete error:"
     4. throw "Silinemedi"
     5. return true

   ⚠️ FAZ 33: DB I/O kanalı `supabase.from(...)` chain'inden tek
   metod çağrısına (`reservationRepository.updateById` /
   `deleteById`) indi. Predicate `.eq("id", id)` repository
   içine taşındı; service body'sinde artık görünmez.
=============================================================== */

import { describe, it, expect } from "vitest";
import * as ts from "typescript";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

function loadSource(relPath: string): ts.SourceFile {
  const abs = resolve(process.cwd(), relPath);
  return ts.createSourceFile(
    relPath,
    readFileSync(abs, "utf8"),
    ts.ScriptTarget.Latest,
    true,
    ts.ScriptKind.TS
  );
}

function findFn(src: ts.SourceFile, name: string): ts.FunctionDeclaration {
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
  visit(src);
  if (!result) throw new Error(`${name} not found`);
  return result;
}

describe("updateReservationStatus — orchestration contract", () => {
  const fn = findFn(
    loadSource("app/services/reservation/status.service.ts"),
    "updateReservationStatus"
  );
  const text = fn.body!.getText();

  it("first statement throws 'ID gerekli'", () => {
    const first = fn.body!.statements[0];
    expect(ts.isIfStatement(first)).toBe(true);
    if (ts.isIfStatement(first)) {
      expect(first.getText()).toContain("ID gerekli");
    }
  });

  it("conditional assertCanConfirm guarded by status === 'confirmed'", () => {
    expect(text).toContain("assertCanConfirm");
    expect(text).toContain('"confirmed"');
  });

  it("reservationRepository.updateById awaited", () => {
    expect(text).toMatch(/await\s+reservationRepository\.updateById/);
  });

  it("repository call passes { status } payload", () => {
    /* Payload shape `{ status }` orchestrator'da inline kalır;
       repository payload'a müdahil olmaz. */
    expect(text).toMatch(/reservationRepository\.updateById\(\s*id\s*,\s*\{\s*status\s*\}\s*\)/);
  });

  it("does NOT call supabase directly (FAZ 33 repository delegation)", () => {
    /* Service body'sinde doğrudan `supabase` çağrısı bulunmamalı. */
    expect(text).not.toMatch(/\bsupabase\b/);
  });

  it("console.error tag '❌ Status error:' aynen", () => {
    expect(text).toContain('"❌ Status error:"');
  });

  it("throw 'Durum güncellenemedi' aynen", () => {
    expect(text).toContain("Durum güncellenemedi");
  });

  it("returns true at the end", () => {
    const last = fn.body!.statements[fn.body!.statements.length - 1];
    expect(ts.isReturnStatement(last)).toBe(true);
    if (ts.isReturnStatement(last)) {
      expect(last.getText()).toContain("true");
    }
  });

  it("LEGACY enum (no 'cancelled') asimetrisi korundu (regression guard)", () => {
    /* Signature ReservationStatusLegacy (3-değerli) kullanıyor.
       Bu test eski API contract'ını korur — eklemek caller breakage. */
    const fullText = readFileSync(
      resolve(process.cwd(), "app/services/reservation/status.service.ts"),
      "utf8"
    );
    expect(fullText).toContain("ReservationStatusLegacy");
  });
});

describe("deleteReservationById — orchestration contract", () => {
  const fn = findFn(
    loadSource("app/services/reservation/delete.service.ts"),
    "deleteReservationById"
  );
  const text = fn.body!.getText();

  it("first statement throws 'ID gerekli'", () => {
    const first = fn.body!.statements[0];
    expect(ts.isIfStatement(first)).toBe(true);
    if (ts.isIfStatement(first)) {
      expect(first.getText()).toContain("ID gerekli");
    }
  });

  it("reservationRepository.deleteById awaited", () => {
    expect(text).toMatch(/await\s+reservationRepository\.deleteById/);
  });

  it("repository call passes id arg only", () => {
    expect(text).toMatch(/reservationRepository\.deleteById\(\s*id\s*\)/);
  });

  it("does NOT call supabase directly (FAZ 33 repository delegation)", () => {
    expect(text).not.toMatch(/\bsupabase\b/);
  });

  it("console.error tag '❌ Delete error:' aynen", () => {
    expect(text).toContain('"❌ Delete error:"');
  });

  it("throw 'Silinemedi' aynen", () => {
    expect(text).toContain("Silinemedi");
  });

  it("returns true at the end", () => {
    const last = fn.body!.statements[fn.body!.statements.length - 1];
    expect(ts.isReturnStatement(last)).toBe(true);
    if (ts.isReturnStatement(last)) {
      expect(last.getText()).toContain("true");
    }
  });

  it("EXACTLY ONE repository.deleteById call (hard delete only — no extra select/cleanup)", () => {
    /* Eski deleteReservationById behavior: hard delete only, no
       cascade in service layer. FAZ 33: invariant aynı; sayım
       repository identifier üzerinden. */
    const repoMatches = text.match(/reservationRepository\.deleteById/g) || [];
    expect(repoMatches.length).toBe(1);
  });
});
