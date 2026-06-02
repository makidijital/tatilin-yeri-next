import { describe, it, expect } from "vitest";

import { validatePublicReservationForm } from "@/app/components/reservation/_helpers/validatePublicReservationForm";
import { initialPublicReservationFormData } from "@/app/components/reservation/_types/reservation-form-data";

/* ===============================================================
   🛡️ FAZ 4 — validatePublicReservationForm UNIT TESTS
   ===============================================================
   Pure validator. Eski ReservationForm > handleSubmit body'sinden
   BYTE-IDENTICAL extract. Regression guard.

   Test edilen kurallar:
     - name required
     - phone required + regex /^(\+90|0)?5\d{9}$/
     - email required + regex
     - identity required + regex /^\d{11}$/
     - payment_method_id required
     - start && end required (date message)
=============================================================== */

const valid = () => ({
  ...initialPublicReservationFormData(),
  name: "Ahmet Yılmaz",
  phone: "05551112233",
  email: "test@example.com",
  identity: "12345678901",
  payment_method_id: "pm-1",
});

describe("validatePublicReservationForm — happy path", () => {
  it("returns {} when all fields valid", () => {
    const errors = validatePublicReservationForm({
      form: valid(),
      start: "2026-06-01",
      end: "2026-06-08",
    });
    expect(errors).toEqual({});
  });
});

describe("validatePublicReservationForm — name", () => {
  it("flags 'Ad zorunlu' when empty", () => {
    const errors = validatePublicReservationForm({
      form: { ...valid(), name: "" },
      start: "2026-06-01",
      end: "2026-06-08",
    });
    expect(errors.name).toBe("Ad zorunlu");
  });
});

describe("validatePublicReservationForm — phone regex", () => {
  it("required: 'Telefon zorunlu' when empty", () => {
    const errors = validatePublicReservationForm({
      form: { ...valid(), phone: "" },
      start: "2026-06-01",
      end: "2026-06-08",
    });
    expect(errors.phone).toBe("Telefon zorunlu");
  });

  it("accepts +90 prefix", () => {
    const errors = validatePublicReservationForm({
      form: { ...valid(), phone: "+905551112233" },
      start: "2026-06-01",
      end: "2026-06-08",
    });
    expect(errors.phone).toBeUndefined();
  });

  it("accepts 0 prefix", () => {
    const errors = validatePublicReservationForm({
      form: { ...valid(), phone: "05551112233" },
      start: "2026-06-01",
      end: "2026-06-08",
    });
    expect(errors.phone).toBeUndefined();
  });

  it("accepts bare 5xxxxxxxxx (no prefix)", () => {
    const errors = validatePublicReservationForm({
      form: { ...valid(), phone: "5551112233" },
      start: "2026-06-01",
      end: "2026-06-08",
    });
    expect(errors.phone).toBeUndefined();
  });

  it("flags invalid 'Geçerli telefon gir' for wrong format", () => {
    const errors = validatePublicReservationForm({
      form: { ...valid(), phone: "1234567890" },
      start: "2026-06-01",
      end: "2026-06-08",
    });
    expect(errors.phone).toBe("Geçerli telefon gir");
  });

  it("flags short numbers", () => {
    const errors = validatePublicReservationForm({
      form: { ...valid(), phone: "555111" },
      start: "2026-06-01",
      end: "2026-06-08",
    });
    expect(errors.phone).toBe("Geçerli telefon gir");
  });
});

describe("validatePublicReservationForm — email regex", () => {
  it("required: 'Email zorunlu' when empty", () => {
    const errors = validatePublicReservationForm({
      form: { ...valid(), email: "" },
      start: "2026-06-01",
      end: "2026-06-08",
    });
    expect(errors.email).toBe("Email zorunlu");
  });

  it("accepts valid email", () => {
    const errors = validatePublicReservationForm({
      form: { ...valid(), email: "user@domain.co.uk" },
      start: "2026-06-01",
      end: "2026-06-08",
    });
    expect(errors.email).toBeUndefined();
  });

  it("flags missing @ → 'Geçerli email gir'", () => {
    const errors = validatePublicReservationForm({
      form: { ...valid(), email: "not-an-email" },
      start: "2026-06-01",
      end: "2026-06-08",
    });
    expect(errors.email).toBe("Geçerli email gir");
  });

  it("flags missing dot → invalid", () => {
    const errors = validatePublicReservationForm({
      form: { ...valid(), email: "user@domain" },
      start: "2026-06-01",
      end: "2026-06-08",
    });
    expect(errors.email).toBe("Geçerli email gir");
  });
});

describe("validatePublicReservationForm — identity (TC) regex", () => {
  it("required: 'TC zorunlu' when empty", () => {
    const errors = validatePublicReservationForm({
      form: { ...valid(), identity: "" },
      start: "2026-06-01",
      end: "2026-06-08",
    });
    expect(errors.identity).toBe("TC zorunlu");
  });

  it("accepts exactly 11 digits", () => {
    const errors = validatePublicReservationForm({
      form: { ...valid(), identity: "12345678901" },
      start: "2026-06-01",
      end: "2026-06-08",
    });
    expect(errors.identity).toBeUndefined();
  });

  it("flags 10 digits → '11 haneli TC gir'", () => {
    const errors = validatePublicReservationForm({
      form: { ...valid(), identity: "1234567890" },
      start: "2026-06-01",
      end: "2026-06-08",
    });
    expect(errors.identity).toBe("11 haneli TC gir");
  });

  it("flags 12 digits", () => {
    const errors = validatePublicReservationForm({
      form: { ...valid(), identity: "123456789012" },
      start: "2026-06-01",
      end: "2026-06-08",
    });
    expect(errors.identity).toBe("11 haneli TC gir");
  });

  it("flags non-digit characters", () => {
    const errors = validatePublicReservationForm({
      form: { ...valid(), identity: "12345abcdef" },
      start: "2026-06-01",
      end: "2026-06-08",
    });
    expect(errors.identity).toBe("11 haneli TC gir");
  });
});

describe("validatePublicReservationForm — payment_method_id", () => {
  it("required: 'Ödeme yöntemi seç' when null", () => {
    const errors = validatePublicReservationForm({
      form: { ...valid(), payment_method_id: null },
      start: "2026-06-01",
      end: "2026-06-08",
    });
    expect(errors.payment_method_id).toBe("Ödeme yöntemi seç");
  });
});

describe("validatePublicReservationForm — date", () => {
  it("flags 'Tarih seçmelisin' when start missing", () => {
    const errors = validatePublicReservationForm({
      form: valid(),
      start: undefined,
      end: "2026-06-08",
    });
    expect(errors.date).toBe("Tarih seçmelisin");
  });

  it("flags 'Tarih seçmelisin' when end missing", () => {
    const errors = validatePublicReservationForm({
      form: valid(),
      start: "2026-06-01",
      end: null,
    });
    expect(errors.date).toBe("Tarih seçmelisin");
  });

  it("flags when both missing", () => {
    const errors = validatePublicReservationForm({
      form: valid(),
      start: null,
      end: null,
    });
    expect(errors.date).toBe("Tarih seçmelisin");
  });
});

describe("validatePublicReservationForm — accumulated errors", () => {
  it("returns ALL failing fields in single pass", () => {
    const errors = validatePublicReservationForm({
      form: {
        ...initialPublicReservationFormData(),
        name: "",
        phone: "",
        email: "",
        identity: "",
        payment_method_id: null,
      },
      start: null,
      end: null,
    });
    expect(Object.keys(errors).sort()).toEqual([
      "date",
      "email",
      "identity",
      "name",
      "payment_method_id",
      "phone",
    ].sort());
  });
});
