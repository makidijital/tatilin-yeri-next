"use server";

import {
  getWesternUnionAccounts,
  createWesternUnionAccount,
  updateWesternUnionAccount,
  deleteWesternUnionAccount,
  setActiveWesternUnionAccount,
} from "@/app/services/western-union-account.service";

/* ===============================================================
   🛡️ WESTERN UNION ACCOUNT — SERVER ACTIONS (thin wrapper, Migration WU-B1)
   ===============================================================
   Client boundary temizliği: `western-union-account.service` (ileride native
   `server-only` repo'ya geçecek) client bundle'ına SIZMASIN. Tek client
   tüketicisi (settings/odeme/_components/WesternUnionAccountsCard.tsx) bu
   action'lara repoint edilir.

   ⚠️ İNCE WRAPPER: iş mantığı YOK — yalnız service'i delege eder. İmzalar +
     dönüş tipleri service'ten türetilir (Parameters/ReturnType → cast/any
     YOK, birebir). Single-active toggle ORCHESTRATION + Result envelope
     davranışı service'te AYNEN. Provider/repository/DB DEĞİŞMEDİ — yalnız
     çağrı sınırı server action'a taşındı (native repoint bu sprintte YOK).
   =============================================================== */

export async function getWesternUnionAccountsAction(
  ...args: Parameters<typeof getWesternUnionAccounts>
): ReturnType<typeof getWesternUnionAccounts> {
  return getWesternUnionAccounts(...args);
}

export async function createWesternUnionAccountAction(
  ...args: Parameters<typeof createWesternUnionAccount>
): ReturnType<typeof createWesternUnionAccount> {
  return createWesternUnionAccount(...args);
}

export async function updateWesternUnionAccountAction(
  ...args: Parameters<typeof updateWesternUnionAccount>
): ReturnType<typeof updateWesternUnionAccount> {
  return updateWesternUnionAccount(...args);
}

export async function deleteWesternUnionAccountAction(
  ...args: Parameters<typeof deleteWesternUnionAccount>
): ReturnType<typeof deleteWesternUnionAccount> {
  return deleteWesternUnionAccount(...args);
}

export async function setActiveWesternUnionAccountAction(
  ...args: Parameters<typeof setActiveWesternUnionAccount>
): ReturnType<typeof setActiveWesternUnionAccount> {
  return setActiveWesternUnionAccount(...args);
}
