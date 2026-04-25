"use client";

import { useEffect, useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import {
  CheckCircle2,
  ShieldCheck,
  AlertTriangle,
  ShieldAlert,
  X,
} from "lucide-react";
import type { TransactionDecision } from "@/lib/api";

export interface ToastItem {
  id: string;
  decision: TransactionDecision;
}

interface Props {
  items: ToastItem[];
  onDismiss: (id: string) => void;
}

const META: Record<
  string,
  { icon: typeof CheckCircle2; colorClass: string; label: string }
> = {
  ALLOW: {
    icon: CheckCircle2,
    colorClass: "border-l-emerald-500 bg-emerald-500/10",
    label: "Approved",
  },
  STEP_UP_AUTH: {
    icon: ShieldCheck,
    colorClass: "border-l-amber-500 bg-amber-500/10",
    label: "Step-up auth",
  },
  HOLD_FOR_REVIEW: {
    icon: AlertTriangle,
    colorClass: "border-l-orange-500 bg-orange-500/10",
    label: "Held for review",
  },
  BLOCK: {
    icon: ShieldAlert,
    colorClass: "border-l-red-500 bg-red-500/10",
    label: "Blocked",
  },
};

export function ToastStack({ items, onDismiss }: Props) {
  return (
    <div className="fixed bottom-5 right-5 z-50 flex flex-col gap-2 w-80">
      <AnimatePresence>
        {items.map((t) => (
          <ToastCard key={t.id} item={t} onDismiss={onDismiss} />
        ))}
      </AnimatePresence>
    </div>
  );
}

function ToastCard({
  item,
  onDismiss,
}: {
  item: ToastItem;
  onDismiss: (id: string) => void;
}) {
  const meta = META[item.decision.action] ?? META.ALLOW;
  const Icon = meta.icon;

  useEffect(() => {
    const t = setTimeout(() => onDismiss(item.id), 5000);
    return () => clearTimeout(t);
  }, [item.id, onDismiss]);

  return (
    <motion.div
      initial={{ opacity: 0, x: 60, scale: 0.96 }}
      animate={{ opacity: 1, x: 0, scale: 1 }}
      exit={{ opacity: 0, x: 60, scale: 0.96 }}
      transition={{ type: "spring", stiffness: 300, damping: 26 }}
      className={`glass card-shadow rounded-2xl border-l-4 px-4 py-3 flex items-start gap-3 ${meta.colorClass}`}
    >
      <Icon className="size-4 mt-0.5 shrink-0" />
      <div className="flex-1 min-w-0">
        <p className="text-xs font-semibold">
          {meta.label} · Risk {item.decision.risk_score.toFixed(0)}
        </p>
        <p className="text-[11px] text-[var(--foreground)]/70 truncate mt-0.5">
          {item.decision.customer_id} via {String(item.decision.compliance?.channel ?? "—")}
        </p>
        <p className="text-[11px] text-[var(--foreground)]/60 truncate">
          {item.decision.explanation.customer.slice(0, 70)}…
        </p>
      </div>
      <button
        type="button"
        onClick={() => onDismiss(item.id)}
        className="shrink-0 size-5 grid place-items-center rounded-full hover:bg-[var(--surface-muted)]"
      >
        <X className="size-3" />
      </button>
    </motion.div>
  );
}
