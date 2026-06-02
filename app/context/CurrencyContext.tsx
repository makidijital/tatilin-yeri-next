"use client";

import {
  createContext,
  useContext,
  useEffect,
  useState,
} from "react";

type CurrencyContextType = {
  currency: string;

  setCurrency: (
    value: string
  ) => void;

  rates: Record<string, number>;
};

const CurrencyContext =
  createContext<CurrencyContextType>({
    currency: "TRY",

    setCurrency: () => {},

    rates: {},
  });

export function CurrencyProvider({
  children,
}: {
  children: React.ReactNode;
}) {

  const [currency, setCurrency] =
    useState("TRY");

  const [rates, setRates] =
    useState<Record<string, number>>({
      TRY: 1,
    });

  // local storage oku
  useEffect(() => {

    const saved =
      localStorage.getItem("currency");

    if (saved) {
      setCurrency(saved);
    }

  }, []);

  // local storage kaydet
  useEffect(() => {

    localStorage.setItem(
      "currency",
      currency
    );

  }, [currency]);

  // 🔥 KURLARI ÇEK
  useEffect(() => {

    async function fetchRates() {

      try {

        const res = await fetch(
          "/api/exchange-rates"
        );

        const data =
          await res.json();

        console.log(
          "KURLAR GELDİ:",
          data
        );

        setRates({
          TRY: 1,

          USD: Number(data.USD),

          EUR: Number(data.EUR),

          GBP: Number(data.GBP),
        });

      } catch (err) {

        console.error(
          "Kur çekme hatası",
          err
        );
      }
    }

    fetchRates();

  }, []);

  return (
    <CurrencyContext.Provider
      value={{
        currency,
        setCurrency,
        rates,
      }}
    >
      {children}
    </CurrencyContext.Provider>
  );
}

export const useCurrency = () =>
  useContext(CurrencyContext);