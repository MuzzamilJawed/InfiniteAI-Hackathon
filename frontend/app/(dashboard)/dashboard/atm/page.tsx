"use client";

import { useState } from "react";
import { motion } from "framer-motion";
import { Banknote, Loader2, Delete } from "lucide-react";
import {
  PAKISTAN_CITIES,
  scoreTransaction,
  type City,
  type TransactionDecision,
} from "@/lib/api";
import { usePersona } from "@/components/PersonaPicker";
import { TransactionResult } from "@/components/TransactionResult";
import { PersonaBar } from "@/components/PersonaBar";

const QUICK_AMOUNTS = [2000, 5000, 10000, 20000, 50000];

export default function ATMPage() {
  const [persona] = usePersona();
  const [pin, setPin] = useState("");
  const [city, setCity] = useState<City>(persona.defaults.city ?? "Karachi");
  const [amount, setAmount] = useState(20000);
  const [decision, setDecision] = useState<TransactionDecision | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  function tap(d: string) {
    if (d === "del") setPin((p) => p.slice(0, -1));
    else if (pin.length < 4) setPin((p) => p + d);
  }

  async function handleWithdraw() {
    if (pin.length !== 4) {
      setError("Please enter your 4-digit PIN.");
      return;
    }
    setError(null);
    setLoading(true);
    try {
      const result = await scoreTransaction({
        ...(persona.defaults as Record<string, never>),
        customer_id: persona.defaults.customer_id ?? "C00123",
        home_city: persona.defaults.home_city ?? "Karachi",
        amount,
        channel: "ATM",
        city,
        merchant_category: "Cash",
        device: persona.defaults.device ?? "trusted_device",
        kyc_tier: persona.defaults.kyc_tier ?? "medium",
        new_beneficiary: false,
      });
      setDecision(result);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="max-w-5xl space-y-4">
      <PersonaBar />
      <div className="grid md:grid-cols-2 gap-8 items-start">
        <motion.div
          initial={{ opacity: 0, x: -10 }}
          animate={{ opacity: 1, x: 0 }}
          className="rounded-[2.5rem] bg-gradient-to-br from-slate-800 to-slate-950 text-white p-6 card-shadow"
        >
          <div className="flex items-center justify-between text-sm">
            <div className="flex items-center gap-2">
              <Banknote className="size-5 text-[var(--gold)]" />
              <span className="font-semibold">fraudentify ATM</span>
            </div>
            <span className="text-xs opacity-70">Branch: {city}</span>
          </div>
          <div className="mt-6 rounded-2xl bg-slate-900/70 p-5 border border-white/10">
            <p className="text-xs uppercase tracking-wider opacity-60">
              Enter PIN
            </p>
            <div className="mt-2 flex gap-2">
              {Array.from({ length: 4 }).map((_, i) => (
                <div
                  key={i}
                  className={`size-10 rounded-lg grid place-items-center font-semibold ${pin.length > i ? "bg-[var(--gold)]/20" : "bg-white/5"
                    }`}
                >
                  {pin[i] ? "•" : ""}
                </div>
              ))}
            </div>
          </div>
          <div className="mt-4 grid grid-cols-3 gap-2">
            {[
              "1",
              "2",
              "3",
              "4",
              "5",
              "6",
              "7",
              "8",
              "9",
              "del",
              "0",
              "ok",
            ].map((d) => (
              <button
                type="button"
                key={d}
                onClick={() => (d === "ok" ? null : tap(d))}
                className={`rounded-xl py-3 font-semibold ${d === "ok"
                    ? "brand-gradient"
                    : d === "del"
                      ? "bg-red-500/30 hover:bg-red-500/50"
                      : "bg-white/10 hover:bg-white/20"
                  }`}
              >
                {d === "del" ? <Delete className="size-4 mx-auto" /> : d}
              </button>
            ))}
          </div>
        </motion.div>

        <div className="space-y-5">
          <header>
            <p className="text-xs uppercase tracking-wider text-[var(--foreground)]/60">
              ATM withdrawal
            </p>
            <h1 className="text-3xl font-semibold tracking-tight">
              Withdraw cash
            </h1>
            <p className="text-[var(--foreground)]/70 mt-1">
              Off-hours, geo-mismatch, and device anomalies are checked in
              real-time.
            </p>
          </header>

          <div>
            <span className="text-xs font-medium text-[var(--foreground)]/70 mb-1 block">
              City
            </span>
            <select
              value={city}
              onChange={(e) => setCity(e.target.value as City)}
              className="w-full rounded-xl border border-[var(--border)] bg-[var(--surface)] px-3 py-2 text-sm"
            >
              {PAKISTAN_CITIES.map((c) => (
                <option key={c} value={c}>
                  {c}
                </option>
              ))}
            </select>
          </div>

          <div className="grid grid-cols-3 sm:grid-cols-5 gap-2">
            {QUICK_AMOUNTS.map((a) => (
              <motion.button
                key={a}
                type="button"
                whileTap={{ scale: 0.97 }}
                onClick={() => setAmount(a)}
                className={`rounded-xl py-2.5 text-sm font-semibold border ${amount === a
                    ? "brand-gradient text-white border-transparent"
                    : "bg-[var(--surface)] border-[var(--border)] hover:border-[var(--brand)]"
                  }`}
              >
                {a.toLocaleString()}
              </motion.button>
            ))}
          </div>

          {error && (
            <p className="text-sm text-red-600 bg-red-500/10 rounded-xl p-2">
              {error}
            </p>
          )}

          <button
            type="button"
            disabled={loading}
            onClick={handleWithdraw}
            className="w-full rounded-2xl py-3 brand-gradient text-white font-semibold disabled:opacity-50 flex items-center justify-center gap-2"
          >
            {loading ? <Loader2 className="size-4 animate-spin" /> : null}
            Withdraw PKR {amount.toLocaleString()}
          </button>
        </div>

        <TransactionResult
          decision={decision}
          onClear={() => setDecision(null)}
        />
      </div>
    </div>
  );
}
