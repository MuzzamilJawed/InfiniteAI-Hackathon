"use client";

import { useState } from "react";
import { motion } from "framer-motion";
import { CreditCard, Loader2 } from "lucide-react";
import {
  MERCHANT_CATEGORIES,
  PAKISTAN_CITIES,
  scoreTransaction,
  type MerchantCategory,
  type City,
  type TransactionDecision,
} from "@/lib/api";
import { usePersona } from "@/components/PersonaPicker";
import { TransactionResult } from "@/components/TransactionResult";
import { PersonaBar } from "@/components/PersonaBar";

export default function CardPaymentPage() {
  const [persona] = usePersona();
  const [amount, setAmount] = useState("4500");
  const [city, setCity] = useState<City>(persona.defaults.city ?? "Karachi");
  const [merchant, setMerchant] = useState<MerchantCategory>("Groceries");
  const [number, setNumber] = useState("4111 1111 1111 0123");
  const [holder, setHolder] = useState("Card Holder");
  const [expiry, setExpiry] = useState("08/29");
  const [cvv, setCvv] = useState("123");
  const [flipped, setFlipped] = useState(false);
  const [decision, setDecision] = useState<TransactionDecision | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handlePay() {
    setError(null);
    setLoading(true);
    try {
      const result = await scoreTransaction({
        ...(persona.defaults as Record<string, never>),
        customer_id: persona.defaults.customer_id ?? "C00123",
        home_city: persona.defaults.home_city ?? "Karachi",
        amount: Number(amount) || 0,
        channel: "Card",
        city,
        merchant_category: merchant,
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
      <div className="grid md:grid-cols-2 gap-10 items-start">
        <div className="space-y-5">
          <p className="text-xs uppercase tracking-wider text-[var(--foreground)]/60">
            Card payment
          </p>
          <h1 className="text-3xl font-semibold tracking-tight">
            Pay at a merchant
          </h1>
          <p className="text-[var(--foreground)]/70">
            Enter mock card details and merchant info. Backend will assess fraud
            risk before approving.
          </p>

          <motion.div
            className="relative h-52 [perspective:1200px] cursor-pointer"
            onClick={() => setFlipped((f) => !f)}
          >
            <motion.div
              className="absolute inset-0 [transform-style:preserve-3d]"
              animate={{ rotateY: flipped ? 180 : 0 }}
              transition={{ duration: 0.5 }}
            >
              <div className="absolute inset-0 [backface-visibility:hidden] rounded-3xl brand-gradient text-white p-6 shadow-xl flex flex-col justify-between">
                <div className="flex items-center justify-between">
                  <span className="font-semibold tracking-wide">fraudentify</span>
                  <CreditCard className="size-6" />
                </div>
                <div>
                  <div className="text-lg tracking-[0.3em] font-mono">
                    {number}
                  </div>
                  <div className="flex justify-between text-xs uppercase mt-3 opacity-90">
                    <span>{holder || "CARDHOLDER"}</span>
                    <span>{expiry}</span>
                  </div>
                </div>
              </div>
              <div className="absolute inset-0 [backface-visibility:hidden] [transform:rotateY(180deg)] rounded-3xl bg-slate-900 text-white p-6 shadow-xl flex flex-col justify-between">
                <div className="h-10 bg-slate-700 -mx-6 mt-2"></div>
                <div className="text-right">
                  <div className="text-xs opacity-70">CVV</div>
                  <div className="bg-white/90 text-slate-900 px-3 py-1.5 inline-block rounded-md font-mono tracking-widest">
                    {cvv}
                  </div>
                </div>
              </div>
            </motion.div>
          </motion.div>
          <p className="text-xs text-[var(--foreground)]/50 text-center">
            Tap card to flip and view CVV
          </p>
        </div>

        <form
          className="glass card-shadow rounded-3xl p-6 space-y-4"
          onSubmit={(e) => {
            e.preventDefault();
            handlePay();
          }}
        >
          <Field label="Cardholder">
            <input
              value={holder}
              onChange={(e) => setHolder(e.target.value)}
              className={inputCls}
            />
          </Field>
          <Field label="Card number">
            <input
              value={number}
              onChange={(e) => setNumber(e.target.value)}
              className={inputCls}
            />
          </Field>
          <div className="grid grid-cols-2 gap-3">
            <Field label="Expiry">
              <input
                value={expiry}
                onChange={(e) => setExpiry(e.target.value)}
                className={inputCls}
              />
            </Field>
            <Field label="CVV">
              <input
                value={cvv}
                onChange={(e) => setCvv(e.target.value)}
                className={inputCls}
                onFocus={() => setFlipped(true)}
                onBlur={() => setFlipped(false)}
              />
            </Field>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <Field label="City">
              <select
                value={city}
                onChange={(e) => setCity(e.target.value as City)}
                className={inputCls}
              >
                {PAKISTAN_CITIES.map((c) => (
                  <option key={c} value={c}>
                    {c}
                  </option>
                ))}
              </select>
            </Field>
            <Field label="Merchant category">
              <select
                value={merchant}
                onChange={(e) =>
                  setMerchant(e.target.value as MerchantCategory)
                }
                className={inputCls}
              >
                {MERCHANT_CATEGORIES.map((m) => (
                  <option key={m} value={m}>
                    {m}
                  </option>
                ))}
              </select>
            </Field>
          </div>
          <Field label="Amount (PKR)">
            <input
              value={amount}
              onChange={(e) => setAmount(e.target.value.replace(/[^\d]/g, ""))}
              className={inputCls}
            />
          </Field>
          {error && (
            <p className="text-sm text-red-600 bg-red-500/10 rounded-xl p-2">
              {error}
            </p>
          )}
          <button
            type="submit"
            disabled={loading}
            className="w-full rounded-2xl py-3 brand-gradient text-white font-semibold disabled:opacity-50 flex items-center justify-center gap-2"
          >
            {loading ? <Loader2 className="size-4 animate-spin" /> : null}
            Pay PKR {Number(amount || 0).toLocaleString()}
          </button>
        </form>

        <TransactionResult
          decision={decision}
          onClear={() => setDecision(null)}
        />
      </div>
    </div>
  );
}

const inputCls =
  "w-full rounded-xl border border-[var(--border)] bg-[var(--surface)] px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[var(--brand)]";

function Field({
  label,
  children,
}: {
  label: string;
  children: React.ReactNode;
}) {
  return (
    <label className="block">
      <span className="text-xs font-medium text-[var(--foreground)]/70 mb-1 block">
        {label}
      </span>
      {children}
    </label>
  );
}
