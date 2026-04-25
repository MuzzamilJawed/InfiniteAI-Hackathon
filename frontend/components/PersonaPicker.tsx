"use client";

import { useEffect, useState } from "react";
import { motion } from "framer-motion";
import { ShieldCheck, AlertTriangle, ShieldAlert } from "lucide-react";
import { PERSONAS, type Persona } from "@/lib/personas";

const RISK_ICON = {
  LOW: ShieldCheck,
  MEDIUM: AlertTriangle,
  HIGH: ShieldAlert,
  CRITICAL: ShieldAlert,
} as const;

const RISK_COLOR = {
  LOW: "text-emerald-600",
  MEDIUM: "text-amber-600",
  HIGH: "text-orange-600",
  CRITICAL: "text-red-600",
} as const;

const STORAGE_KEY = "safebank_persona_v1";

export function usePersona(): [Persona, (id: string) => void] {
  const [active, setActive] = useState<Persona>(PERSONAS[0]);
  useEffect(() => {
    if (typeof window === "undefined") return;
    const stored = window.localStorage.getItem(STORAGE_KEY);
    if (stored) {
      const found = PERSONAS.find((p) => p.id === stored);
      if (found) setActive(found);
    }
  }, []);
  const update = (id: string) => {
    const next = PERSONAS.find((p) => p.id === id);
    if (!next) return;
    setActive(next);
    if (typeof window !== "undefined") {
      window.localStorage.setItem(STORAGE_KEY, id);
    }
  };
  return [active, update];
}

interface Props {
  active: Persona;
  onChange: (id: string) => void;
}

export function PersonaPicker({ active, onChange }: Props) {
  return (
    <section className="grid gap-3 md:grid-cols-3">
      {PERSONAS.map((p) => {
        const Icon = RISK_ICON[p.riskHint];
        const colorClass = RISK_COLOR[p.riskHint];
        const isActive = p.id === active.id;
        return (
          <motion.button
            key={p.id}
            type="button"
            whileHover={{ y: -2 }}
            whileTap={{ scale: 0.99 }}
            onClick={() => onChange(p.id)}
            className={`text-left glass card-shadow rounded-2xl p-4 border transition-colors ${
              isActive
                ? "border-[var(--brand)] ring-2 ring-[var(--brand)]/30"
                : "border-[var(--border)] hover:border-[var(--brand)]/60"
            }`}
          >
            <div className="flex items-center justify-between">
              <span className="text-xs uppercase tracking-wider text-[var(--foreground)]/60">
                {p.id}
              </span>
              <Icon className={`size-4 ${colorClass}`} />
            </div>
            <h3 className="font-semibold mt-1.5">{p.label}</h3>
            <p className="text-sm text-[var(--foreground)]/70 mt-1.5 leading-relaxed">
              {p.description}
            </p>
            <div className="mt-3 text-xs flex items-center gap-2">
              <span className="rounded-full bg-[var(--surface-muted)] px-2 py-0.5">
                KYC {p.defaults.kyc_tier}
              </span>
              <span className="rounded-full bg-[var(--surface-muted)] px-2 py-0.5">
                Avg PKR {p.defaults.avg_user_amount?.toLocaleString()}
              </span>
            </div>
          </motion.button>
        );
      })}
    </section>
  );
}
