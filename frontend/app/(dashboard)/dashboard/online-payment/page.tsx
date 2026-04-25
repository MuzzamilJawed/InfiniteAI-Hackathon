"use client";

import { useState } from "react";
import { motion } from "framer-motion";
import { ArrowRight, Loader2 } from "lucide-react";
import {
  ONLINE_CHANNELS,
  PAKISTAN_CITIES,
  scoreTransaction,
  type Channel,
  type City,
  type TransactionDecision,
} from "@/lib/api";
import { usePersona } from "@/components/PersonaPicker";
import { TransactionResult } from "@/components/TransactionResult";
import { PersonaBar } from "@/components/PersonaBar";

export default function OnlinePaymentPage() {
  const [persona] = usePersona();
  const [channel, setChannel] = useState<Channel>("IBFT");
  const [amount, setAmount] = useState("12500");
  const [city, setCity] = useState<City>(persona.defaults.city ?? "Karachi");
  const [beneficiaryName, setBeneficiaryName] = useState("Beneficiary");
  const [account, setAccount] = useState("PK36SCBL0000001123456702");
  const [newBeneficiary, setNewBeneficiary] = useState(true);
  const [decision, setDecision] = useState<TransactionDecision | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleSend() {
    setError(null);
    setLoading(true);
    try {
      const result = await scoreTransaction({
        ...(persona.defaults as Record<string, never>),
        customer_id: persona.defaults.customer_id ?? "C00123",
        home_city: persona.defaults.home_city ?? "Karachi",
        amount: Number(amount) || 0,
        channel,
        city,
        merchant_category: "P2P",
        device: persona.defaults.device ?? "trusted_device",
        kyc_tier: persona.defaults.kyc_tier ?? "medium",
        new_beneficiary: newBeneficiary,
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
      <header>
        <p className="text-xs uppercase tracking-wider text-[var(--foreground)]/60">
          Online payment
        </p>
        <h1 className="text-3xl font-semibold tracking-tight">
          Send money instantly
        </h1>
        <p className="text-[var(--foreground)]/70 mt-1">
          Choose your payment channel and beneficiary. The system applies
          channel-specific risk and beneficiary novelty checks.
        </p>
      </header>

      <div className="grid gap-2 sm:grid-cols-5 grid-cols-2">
        {ONLINE_CHANNELS.map((c) => (
          <motion.button
            key={c}
            whileHover={{ y: -2 }}
            type="button"
            onClick={() => setChannel(c)}
            className={`rounded-2xl px-3 py-3 text-sm font-medium border ${
              channel === c
                ? "brand-gradient text-white border-transparent"
                : "bg-[var(--surface)] border-[var(--border)] hover:border-[var(--brand)]"
            }`}
          >
            {c}
          </motion.button>
        ))}
      </div>

      <div className="grid md:grid-cols-2 gap-6">
        <form
          className="glass card-shadow rounded-3xl p-6 space-y-4"
          onSubmit={(e) => {
            e.preventDefault();
            handleSend();
          }}
        >
          <Field label="Beneficiary name">
            <input
              value={beneficiaryName}
              onChange={(e) => setBeneficiaryName(e.target.value)}
              className={inputCls}
            />
          </Field>
          <Field label="Account / IBAN">
            <input
              value={account}
              onChange={(e) => setAccount(e.target.value)}
              className={inputCls}
            />
          </Field>
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
            <Field label="Amount (PKR)">
              <input
                value={amount}
                onChange={(e) =>
                  setAmount(e.target.value.replace(/[^\d]/g, ""))
                }
                className={inputCls}
              />
            </Field>
          </div>
          <label className="flex items-center gap-2 text-sm">
            <input
              type="checkbox"
              checked={newBeneficiary}
              onChange={(e) => setNewBeneficiary(e.target.checked)}
              className="size-4 accent-[var(--brand)]"
            />
            New beneficiary
          </label>
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
            Send via {channel} <ArrowRight className="size-4" />
          </button>
        </form>

        <aside className="rounded-3xl border border-[var(--border)] p-6 bg-[var(--surface)]/60 space-y-3">
          <h3 className="font-medium">Beneficiary preview</h3>
          <div className="rounded-2xl bg-[var(--surface-muted)] p-4 text-sm space-y-1">
            <div className="font-semibold">{beneficiaryName}</div>
            <div className="font-mono text-xs">{account}</div>
            <div className="text-xs text-[var(--foreground)]/70">
              {city}, Pakistan
            </div>
          </div>
          <h3 className="font-medium pt-2">Channel notes</h3>
          <ul className="text-sm space-y-1 text-[var(--foreground)]/75">
            <li>
              <strong>Raast / IBFT</strong>: instant bank-to-bank
            </li>
            <li>
              <strong>1LINK</strong>: card-based switching
            </li>
            <li>
              <strong>JazzCash / Easypaisa</strong>: mobile wallet
            </li>
          </ul>
        </aside>
      </div>

      <TransactionResult
        decision={decision}
        onClear={() => setDecision(null)}
      />
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
