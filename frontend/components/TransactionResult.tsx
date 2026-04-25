"use client";

import Link from "next/link";
import { motion, AnimatePresence } from "framer-motion";
import {
  CheckCircle2,
  ShieldCheck,
  AlertTriangle,
  ShieldAlert,
} from "lucide-react";
import type { TransactionDecision } from "@/lib/api";

interface Props {
  decision: TransactionDecision | null;
  onClear: () => void;
}

const BAND_CONFIG: Record<
  string,
  {
    icon: typeof CheckCircle2;
    color: string;
    title: string;
    message: string;
    showAlertLink: boolean;
  }
> = {
  LOW: {
    icon: CheckCircle2,
    color: "emerald",
    title: "Payment successful",
    message: "Your transaction was approved. No anomalies detected.",
    showAlertLink: false,
  },
  MEDIUM: {
    icon: ShieldCheck,
    color: "amber",
    title: "Payment processed",
    message:
      "Your transaction went through. Our system flagged it for a routine review — no action needed from you.",
    showAlertLink: true,
  },
  HIGH: {
    icon: AlertTriangle,
    color: "orange",
    title: "Payment under review",
    message:
      "Your transaction has been submitted but is held for security review. You will be notified once it is resolved.",
    showAlertLink: true,
  },
  CRITICAL: {
    icon: ShieldAlert,
    color: "red",
    title: "Transaction blocked",
    message:
      "This transaction was blocked for your protection. Please check Security Alerts for details.",
    showAlertLink: true,
  },
};

const COLOR_MAP: Record<string, { bg: string; icon: string; badge: string }> = {
  emerald: {
    bg: "bg-emerald-500/10 border-emerald-500/30",
    icon: "text-emerald-600",
    badge: "bg-emerald-500/20 text-emerald-700",
  },
  amber: {
    bg: "bg-amber-500/10 border-amber-500/30",
    icon: "text-amber-600",
    badge: "bg-amber-500/20 text-amber-700",
  },
  orange: {
    bg: "bg-orange-500/10 border-orange-500/30",
    icon: "text-orange-600",
    badge: "bg-orange-500/20 text-orange-700",
  },
  red: {
    bg: "bg-red-500/10 border-red-500/30",
    icon: "text-red-600",
    badge: "bg-red-500/20 text-red-700",
  },
};

export function TransactionResult({ decision, onClear }: Props) {
  if (!decision) return null;

  const config = BAND_CONFIG[decision.risk_band] ?? BAND_CONFIG.LOW;
  const colors = COLOR_MAP[config.color];
  const Icon = config.icon;

  return (
    <AnimatePresence>
      <motion.div
        initial={{ opacity: 0, y: 8 }}
        animate={{ opacity: 1, y: 0 }}
        exit={{ opacity: 0, y: -6 }}
        className={`rounded-2xl border p-4 ${colors.bg}`}
      >
        <div className="flex items-start gap-3">
          <Icon className={`size-5 shrink-0 mt-0.5 ${colors.icon}`} />
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2 flex-wrap">
              <p className="text-sm font-semibold">{config.title}</p>
              <span
                className={`text-[10px] font-bold px-1.5 py-0.5 rounded-full ${colors.badge}`}
              >
                {decision.risk_band}
              </span>
            </div>
            <p className="text-xs text-[var(--foreground)]/70 mt-1">
              {config.message}
            </p>
            {config.showAlertLink && (
              <Link
                href="/dashboard/confirm"
                className="inline-flex items-center gap-1 text-xs font-medium text-[var(--brand)] mt-2 hover:underline"
              >
                View in Security Alerts →
              </Link>
            )}
          </div>
          <button
            type="button"
            onClick={onClear}
            className="text-xs font-medium px-3 py-1.5 rounded-xl border border-[var(--border)] hover:bg-[var(--surface-muted)] transition-colors shrink-0"
          >
            OK
          </button>
        </div>
      </motion.div>
    </AnimatePresence>
  );
}
