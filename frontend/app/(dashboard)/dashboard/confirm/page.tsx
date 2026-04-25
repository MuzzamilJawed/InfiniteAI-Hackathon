"use client";

import { useEffect, useState } from "react";
import { motion } from "framer-motion";
import { ShieldCheck, ShieldAlert, Loader2 } from "lucide-react";
import {
  confirmTransaction,
  recentDecisions,
  type TransactionDecision,
} from "@/lib/api";

export default function ConfirmPage() {
  const [items, setItems] = useState<TransactionDecision[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [pendingId, setPendingId] = useState<string | null>(null);
  const [outcome, setOutcome] = useState<Record<string, string>>({});

  async function load() {
    setLoading(true);
    setError(null);
    try {
      const data = await recentDecisions();
      setItems(data);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    load();
  }, []);

  async function decide(item: TransactionDecision, yes: boolean) {
    setPendingId(item.transaction_id);
    try {
      const res = await confirmTransaction(
        item.transaction_id,
        item.customer_id,
        yes
      );
      setOutcome((o) => ({
        ...o,
        [item.transaction_id]: res.message,
      }));
    } catch (e) {
      setOutcome((o) => ({
        ...o,
        [item.transaction_id]: (e as Error).message,
      }));
    } finally {
      setPendingId(null);
    }
  }

  const flagged = items.filter(
    (i) => i.action === "HOLD_FOR_REVIEW" || i.action === "BLOCK" || i.action === "STEP_UP_AUTH"
  );

  return (
    <div className="max-w-4xl space-y-6">
      <header className="space-y-2">
        <p className="text-xs uppercase tracking-wider text-[var(--foreground)]/60">
          Security alerts
        </p>
        <h1 className="text-3xl font-semibold tracking-tight">
          Was this you?
        </h1>
        <p className="text-[var(--foreground)]/70">
          Recent transactions where extra checks were applied. Confirm to clear,
          or report to escalate to fraud ops.
        </p>
      </header>

      <div className="flex justify-end">
        <button
          type="button"
          onClick={load}
          className="text-sm rounded-xl px-3 py-2 border border-[var(--border)] hover:border-[var(--brand)]"
        >
          Refresh
        </button>
      </div>

      {error && (
        <p className="text-sm text-red-600 bg-red-500/10 rounded-xl p-2">
          {error}
        </p>
      )}

      {loading ? (
        <div className="flex items-center gap-2 text-[var(--foreground)]/70">
          <Loader2 className="size-4 animate-spin" /> Loading recent activity...
        </div>
      ) : flagged.length === 0 ? (
        <div className="rounded-3xl border border-[var(--border)] p-8 text-center">
          <ShieldCheck className="mx-auto size-8 text-[var(--brand)]" />
          <h3 className="mt-3 font-semibold">All clear</h3>
          <p className="text-sm text-[var(--foreground)]/70 mt-1">
            No flagged transactions. Try a payment or ATM withdrawal that looks
            suspicious to see this list update.
          </p>
        </div>
      ) : (
        <ul className="space-y-3">
          {flagged.map((item) => (
            <motion.li
              key={item.transaction_id}
              initial={{ opacity: 0, y: 6 }}
              animate={{ opacity: 1, y: 0 }}
              className="rounded-3xl border border-[var(--border)] p-5 glass card-shadow"
            >
              <div className="flex items-start justify-between gap-4">
                <div>
                  <div className="flex items-center gap-2">
                    <ShieldAlert className="size-4 text-[var(--brand)]" />
                    <span className="font-semibold">
                      Risk band {item.risk_band}
                    </span>
                    <span className="text-xs px-2 py-0.5 rounded-full bg-[var(--surface-muted)]">
                      {item.action}
                    </span>
                  </div>
                  <p className="text-sm mt-2 text-[var(--foreground)]/85">
                    {item.explanation.customer}
                  </p>
                  <p className="text-xs mt-2 text-[var(--foreground)]/60">
                    {new Date(item.timestamp).toLocaleString()} · TX{" "}
                    {item.transaction_id}
                  </p>
                  <div className="flex flex-wrap gap-1.5 mt-3">
                    {item.reason_codes.slice(0, 4).map((r) => (
                      <span
                        key={r.code}
                        className="text-[10px] uppercase tracking-wider rounded-full bg-[var(--surface-muted)] px-2 py-0.5"
                      >
                        {r.code}
                      </span>
                    ))}
                  </div>
                </div>
                <div className="text-right">
                  <div className="text-xs text-[var(--foreground)]/60">
                    Risk score
                  </div>
                  <div className="text-2xl font-semibold brand-text-gradient">
                    {item.risk_score.toFixed(0)}
                  </div>
                </div>
              </div>
              {outcome[item.transaction_id] ? (
                <p className="mt-3 text-sm rounded-xl bg-emerald-500/10 text-emerald-800 dark:text-emerald-200 p-3">
                  {outcome[item.transaction_id]}
                </p>
              ) : (
                <div className="mt-4 flex gap-2">
                  <button
                    type="button"
                    disabled={pendingId === item.transaction_id}
                    onClick={() => decide(item, true)}
                    className="flex-1 rounded-xl border border-[var(--brand)] text-[var(--brand)] py-2 text-sm font-medium hover:bg-[var(--brand)] hover:text-white"
                  >
                    Yes, this was me
                  </button>
                  <button
                    type="button"
                    disabled={pendingId === item.transaction_id}
                    onClick={() => decide(item, false)}
                    className="flex-1 rounded-xl bg-red-500/15 text-red-700 dark:text-red-300 py-2 text-sm font-medium hover:bg-red-500/25"
                  >
                    Report fraud
                  </button>
                </div>
              )}
            </motion.li>
          ))}
        </ul>
      )}
    </div>
  );
}
