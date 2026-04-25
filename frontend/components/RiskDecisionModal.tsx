"use client";

import { motion, AnimatePresence } from "framer-motion";
import {
  CheckCircle2,
  ShieldCheck,
  ShieldAlert,
  AlertTriangle,
  X,
} from "lucide-react";
import type { TransactionDecision } from "@/lib/api";

interface Props {
  decision: TransactionDecision | null;
  onClose: () => void;
}

const META: Record<
  string,
  {
    icon: typeof CheckCircle2;
    title: string;
    accent: string;
    badge: string;
    statusLine: string;
  }
> = {
  ALLOW: {
    icon: CheckCircle2,
    title: "Transaction approved",
    accent: "from-emerald-500/20 to-emerald-500/0",
    badge: "bg-emerald-500/15 text-emerald-700 dark:text-emerald-300",
    statusLine: "Your payment was processed successfully.",
  },
  STEP_UP_AUTH: {
    icon: ShieldCheck,
    title: "Additional verification applied",
    accent: "from-amber-500/20 to-amber-500/0",
    badge: "bg-amber-500/15 text-amber-700 dark:text-amber-300",
    statusLine: "Extra security checks were applied to this transaction.",
  },
  HOLD_FOR_REVIEW: {
    icon: AlertTriangle,
    title: "Held for analyst review",
    accent: "from-orange-500/20 to-orange-500/0",
    badge: "bg-orange-500/15 text-orange-700 dark:text-orange-300",
    statusLine:
      "This transaction has been sent for manual review by our fraud team. You'll be notified once resolved.",
  },
  BLOCK: {
    icon: ShieldAlert,
    title: "Transaction blocked",
    accent: "from-red-500/20 to-red-500/0",
    badge: "bg-red-500/15 text-red-700 dark:text-red-300",
    statusLine:
      "This transaction was automatically blocked for your protection. Check Security Alerts for details.",
  },
};

export function RiskDecisionModal({ decision, onClose }: Props) {
  const open = decision !== null;

  return (
    <AnimatePresence>
      {open && decision && (
        <motion.div
          key="backdrop"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          onClick={onClose}
          className="fixed inset-0 z-40 flex items-end justify-center sm:items-center bg-black/40 backdrop-blur-sm p-4"
        >
          <motion.div
            initial={{ y: 20, opacity: 0, scale: 0.98 }}
            animate={{ y: 0, opacity: 1, scale: 1 }}
            exit={{ y: 10, opacity: 0 }}
            transition={{ type: "spring", stiffness: 320, damping: 26 }}
            onClick={(e) => e.stopPropagation()}
            className="relative w-full max-w-lg overflow-hidden rounded-3xl glass card-shadow border border-[var(--border)]"
          >
            {/* Gradient accent */}
            <div
              className={`absolute inset-x-0 top-0 h-32 bg-gradient-to-b ${META[decision.action].accent} pointer-events-none`}
            />

            {/* Close button */}
            <button
              type="button"
              onClick={onClose}
              className="absolute top-3 right-3 z-10 size-8 grid place-items-center rounded-full hover:bg-[var(--surface-muted)] transition-colors"
              aria-label="Close"
            >
              <X className="size-4" />
            </button>

            <div className="relative p-6 sm:p-8 space-y-5">
              {/* Header */}
              <ModalHeader decision={decision} />

              {/* Score chips */}
              <div className="grid grid-cols-3 gap-2 text-center">
                <ScoreChip label="Risk" value={decision.risk_score} highlight />
                <ScoreChip label="Anomaly" value={decision.anomaly_score} />
                <ScoreChip label="Fraud" value={decision.fraud_score} />
              </div>

              {/* Customer explanation */}
              <p className="text-sm leading-relaxed">
                {decision.explanation.customer}
              </p>

              {/* Status line */}
              <div
                className={`rounded-2xl p-4 text-sm ${META[decision.action].badge}`}
              >
                {META[decision.action].statusLine}
              </div>

              {/* Reason codes (collapsed) */}
              {decision.reason_codes.length > 0 && (
                <details className="rounded-xl bg-[var(--surface-muted)] text-xs">
                  <summary className="px-3 py-2.5 cursor-pointer font-medium select-none">
                    {decision.reason_codes.length} risk signal
                    {decision.reason_codes.length > 1 ? "s" : ""} detected
                  </summary>
                  <div className="px-3 pb-3 space-y-1.5 max-h-36 overflow-auto scrollbar-thin">
                    {decision.reason_codes.map((r) => (
                      <div key={r.code} className="flex justify-between gap-3">
                        <span className="font-medium">{r.code}</span>
                        <span className="text-[var(--foreground)]/70 text-right">
                          {r.description}
                        </span>
                      </div>
                    ))}
                  </div>
                </details>
              )}

              {/* Done button */}
              <button
                type="button"
                onClick={onClose}
                className="w-full rounded-2xl py-3 brand-gradient text-white font-semibold"
              >
                Done
              </button>

              <div className="text-[10px] text-[var(--foreground)]/50 text-center">
                Ref: {decision.transaction_id}
              </div>
            </div>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}

function ModalHeader({ decision }: { decision: TransactionDecision }) {
  const info = META[decision.action];
  const Icon = info.icon;
  return (
    <div className="flex items-center gap-3">
      <div className="size-12 rounded-2xl brand-gradient grid place-items-center text-white">
        <Icon className="size-6" />
      </div>
      <div>
        <p className={`text-xs px-2 py-0.5 inline-block rounded-full ${info.badge}`}>
          Risk band {decision.risk_band}
        </p>
        <h2 className="text-xl font-semibold">{info.title}</h2>
      </div>
    </div>
  );
}

function ScoreChip({
  label,
  value,
  highlight,
}: {
  label: string;
  value: number;
  highlight?: boolean;
}) {
  return (
    <div
      className={`rounded-2xl px-3 py-2 ${
        highlight
          ? "brand-gradient text-white"
          : "bg-[var(--surface-muted)] text-[var(--foreground)]"
      }`}
    >
      <div className="text-[10px] uppercase tracking-wider opacity-80">
        {label}
      </div>
      <div className="text-lg font-semibold">{value.toFixed(0)}</div>
    </div>
  );
}
