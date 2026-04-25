"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import {
  Activity,
  AlertTriangle,
  CheckCircle2,
  Lock,
  RefreshCw,
  ShieldAlert,
  ShieldCheck,
  TrendingUp,
  Wifi,
} from "lucide-react";
import { recentDecisions, type TransactionDecision } from "@/lib/api";
import { useAuth } from "@/context/AuthContext";
import { ToastStack, type ToastItem } from "@/components/Toast";

const BAND_COLOR: Record<string, string> = {
  LOW: "text-emerald-600 bg-emerald-500/10",
  MEDIUM: "text-amber-600 bg-amber-500/10",
  HIGH: "text-orange-600 bg-orange-500/10",
  CRITICAL: "text-red-600 bg-red-500/10",
};

const ACTION_ICON: Record<string, typeof CheckCircle2> = {
  ALLOW: CheckCircle2,
  STEP_UP_AUTH: ShieldCheck,
  HOLD_FOR_REVIEW: AlertTriangle,
  BLOCK: Lock,
};

const POLL_INTERVAL_MS = 3000;

export default function DashboardPage() {
  const { user } = useAuth();
  const [decisions, setDecisions] = useState<TransactionDecision[]>([]);
  const [loading, setLoading] = useState(true);
  const [liveConnected, setLiveConnected] = useState(false);
  const [lastRefresh, setLastRefresh] = useState(new Date());
  const [newIds, setNewIds] = useState<Set<string>>(new Set());
  const [toasts, setToasts] = useState<ToastItem[]>([]);
  const knownIds = useRef<Set<string>>(new Set());

  const dismissToast = useCallback((id: string) => {
    setToasts((prev) => prev.filter((t) => t.id !== id));
  }, []);

  const load = useCallback(async (silent = false) => {
    if (!silent) setLoading(true);
    try {
      const data = await recentDecisions();
      setLiveConnected(true);

      const incoming = new Set<string>();
      const newToasts: ToastItem[] = [];

      data.forEach((d) => {
        if (!knownIds.current.has(d.transaction_id)) {
          incoming.add(d.transaction_id);
          knownIds.current.add(d.transaction_id);
          newToasts.push({ id: d.transaction_id, decision: d });
        }
      });

      if (incoming.size > 0 && knownIds.current.size > incoming.size) {
        setNewIds(incoming);
        setToasts((prev) => [...newToasts.slice(0, 3), ...prev].slice(0, 5));
        setTimeout(() => setNewIds(new Set()), 3000);
      } else {
        data.forEach((d) => knownIds.current.add(d.transaction_id));
      }

      setDecisions(data);
      setLastRefresh(new Date());
    } catch {
      setLiveConnected(false);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load(false);
    const timer = setInterval(() => load(true), POLL_INTERVAL_MS);
    return () => clearInterval(timer);
  }, [load]);

  const total = decisions.length;
  const blocked = decisions.filter((d) => d.action === "BLOCK").length;
  const held = decisions.filter((d) => d.action === "HOLD_FOR_REVIEW").length;
  const stepUp = decisions.filter((d) => d.action === "STEP_UP_AUTH").length;
  const allowed = decisions.filter((d) => d.action === "ALLOW").length;
  const amlCount = decisions.filter((d) => d.compliance?.aml_review_required).length;
  const avgRisk =
    total > 0
      ? (decisions.reduce((s, d) => s + d.risk_score, 0) / total).toFixed(1)
      : "—";

  const bandCounts: Record<string, number> = {
    LOW: 0,
    MEDIUM: 0,
    HIGH: 0,
    CRITICAL: 0,
  };
  for (const d of decisions) {
    bandCounts[d.risk_band] = (bandCounts[d.risk_band] || 0) + 1;
  }
  const maxBand = Math.max(...Object.values(bandCounts), 1);

  return (
    <>
      <div className="space-y-6 max-w-7xl mx-auto">
        {/* Header */}
        <div className="flex items-center justify-between flex-wrap gap-3">
          <div>
            <h2 className="text-xl font-semibold">
              Good day, {user?.name?.split(" ")[0]} 👋
            </h2>
            <p className="text-sm text-[var(--foreground)]/60">
              Live fraud monitoring · auto-refresh every {POLL_INTERVAL_MS / 1000}s ·{" "}
              {lastRefresh.toLocaleTimeString()}
            </p>
          </div>
          <div className="flex items-center gap-3">
            <div
              className={`flex items-center gap-1.5 rounded-xl px-3 py-1.5 text-xs font-medium border ${
                liveConnected
                  ? "bg-emerald-500/10 border-emerald-500/30 text-emerald-600"
                  : "bg-red-500/10 border-red-500/30 text-red-600"
              }`}
            >
              <Wifi className="size-3" />
              <span className="relative flex size-2">
                {liveConnected && (
                  <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-500 opacity-75" />
                )}
                <span
                  className={`relative inline-flex rounded-full size-2 ${
                    liveConnected ? "bg-emerald-500" : "bg-red-500"
                  }`}
                />
              </span>
              {liveConnected ? "Live" : "Offline"}
            </div>
            <button
              type="button"
              onClick={() => load(false)}
              className="flex items-center gap-2 text-sm rounded-xl border border-[var(--border)] px-3 py-2 hover:border-[var(--brand)] transition-colors"
            >
              <RefreshCw className={`size-3.5 ${loading ? "animate-spin" : ""}`} />
              Refresh
            </button>
          </div>
        </div>

        {/* KPI strip */}
        <div className="grid grid-cols-2 sm:grid-cols-3 xl:grid-cols-6 gap-3">
          {[
            { label: "Total scored", value: total, icon: Activity },
            { label: "Allowed", value: allowed, icon: CheckCircle2 },
            { label: "Step-up auth", value: stepUp, icon: ShieldCheck },
            { label: "Held / Blocked", value: held + blocked, icon: AlertTriangle },
            { label: "AML flagged", value: amlCount, icon: ShieldAlert },
            { label: "Avg risk score", value: avgRisk, icon: TrendingUp },
          ].map(({ label, value, icon: Icon }, i) => (
            <motion.div
              key={label}
              initial={{ opacity: 0, y: 8 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: i * 0.05 }}
              className="glass card-shadow rounded-2xl px-4 py-4 space-y-2"
            >
              <div className="flex items-center justify-between">
                <span className="text-xs text-[var(--foreground)]/60">{label}</span>
                <Icon className="size-3.5 text-[var(--brand)]" />
              </div>
              <div className="text-2xl font-bold">{value}</div>
            </motion.div>
          ))}
        </div>

        <div className="grid lg:grid-cols-5 gap-4">
          {/* Risk band bar chart */}
          <div className="lg:col-span-2 glass card-shadow rounded-2xl p-5 space-y-4">
            <h3 className="font-semibold text-sm">Risk band distribution</h3>
            {total === 0 ? (
              <EmptyState />
            ) : (
              <div className="space-y-3">
                {(["LOW", "MEDIUM", "HIGH", "CRITICAL"] as const).map((band) => {
                  const count = bandCounts[band] || 0;
                  const pct = Math.round((count / (total || 1)) * 100);
                  const barColors: Record<string, string> = {
                    LOW: "bg-emerald-500",
                    MEDIUM: "bg-amber-500",
                    HIGH: "bg-orange-500",
                    CRITICAL: "bg-red-500",
                  };
                  return (
                    <div key={band} className="space-y-1.5">
                      <div className="flex justify-between text-xs">
                        <span className="font-medium">{band}</span>
                        <span className="text-[var(--foreground)]/60">
                          {count} ({pct}%)
                        </span>
                      </div>
                      <div className="h-2 rounded-full bg-[var(--surface-muted)] overflow-hidden">
                        <motion.div
                          initial={{ width: 0 }}
                          animate={{ width: `${(count / maxBand) * 100}%` }}
                          transition={{ duration: 0.6, ease: "easeOut" }}
                          className={`h-full rounded-full ${barColors[band]}`}
                        />
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>

          {/* Live decisions feed */}
          <div className="lg:col-span-3 glass card-shadow rounded-2xl p-5 space-y-3">
            <div className="flex items-center justify-between">
              <h3 className="font-semibold text-sm">Live transaction feed</h3>
              {newIds.size > 0 && (
                <motion.span
                  initial={{ scale: 0.8, opacity: 0 }}
                  animate={{ scale: 1, opacity: 1 }}
                  exit={{ scale: 0.8, opacity: 0 }}
                  className="text-[10px] px-2 py-0.5 rounded-full bg-[var(--brand)] text-white font-semibold"
                >
                  +{newIds.size} new
                </motion.span>
              )}
            </div>

            {total === 0 ? (
              <EmptyState />
            ) : (
              <div className="space-y-1.5 max-h-72 overflow-y-auto scrollbar-thin pr-1">
                <AnimatePresence initial={false}>
                  {decisions.slice(0, 20).map((d) => {
                    const Icon = ACTION_ICON[d.action] ?? Activity;
                    const isNew = newIds.has(d.transaction_id);
                    return (
                      <motion.div
                        key={d.transaction_id}
                        initial={{ opacity: 0, x: 12 }}
                        animate={{ opacity: 1, x: 0 }}
                        layout
                        className={`flex items-center gap-3 rounded-xl px-3 py-2.5 transition-colors ${
                          isNew
                            ? "bg-[var(--brand)]/10 border border-[var(--brand)]/30"
                            : "hover:bg-[var(--surface-muted)]"
                        }`}
                      >
                        <div className="size-8 rounded-lg bg-[var(--surface-muted)] grid place-items-center shrink-0">
                          <Icon className="size-3.5 text-[var(--brand)]" />
                        </div>
                        <div className="flex-1 min-w-0">
                          <div className="text-xs font-medium flex items-center gap-2 truncate">
                            <span>{d.customer_id}</span>
                            <span className="text-[var(--foreground)]/40">·</span>
                            <span>{String(d.compliance?.channel ?? "—")}</span>
                            <span className="text-[var(--foreground)]/40">·</span>
                            <span>{String(d.compliance?.city ?? "—")}</span>
                            {isNew && (
                              <span className="text-[10px] px-1.5 py-0.5 rounded-full bg-[var(--brand)] text-white font-semibold shrink-0">
                                NEW
                              </span>
                            )}
                          </div>
                          <div className="text-[11px] text-[var(--foreground)]/55 truncate mt-0.5">
                            {d.explanation.customer.slice(0, 75)}
                            {d.explanation.customer.length > 75 ? "…" : ""}
                          </div>
                        </div>
                        <div className="text-right shrink-0 space-y-0.5">
                          <div className="text-sm font-bold">
                            {d.risk_score.toFixed(0)}
                          </div>
                          <span
                            className={`text-[10px] px-1.5 py-0.5 rounded-full font-medium ${
                              BAND_COLOR[d.risk_band]
                            }`}
                          >
                            {d.risk_band}
                          </span>
                        </div>
                      </motion.div>
                    );
                  })}
                </AnimatePresence>
              </div>
            )}
          </div>
        </div>

        {/* Compliance summary */}
        <div className="glass card-shadow rounded-2xl p-5 space-y-4">
          <h3 className="font-semibold text-sm">Pakistan compliance summary</h3>
          <div className="grid sm:grid-cols-3 gap-4 text-sm">
            <ComplianceStat
              label="SBP monitoring flags"
              value={decisions.filter((d) => d.compliance?.sbp_risk_monitoring_flag).length}
              total={total}
            />
            <ComplianceStat
              label="AML/CFT reviews required"
              value={amlCount}
              total={total}
            />
            <ComplianceStat
              label="High/Critical + Low KYC"
              value={decisions.filter(
                (d) =>
                  d.compliance?.kyc_tier === "low" &&
                  ["HIGH", "CRITICAL"].includes(d.risk_band)
              ).length}
              total={total}
            />
          </div>
        </div>
      </div>

      <ToastStack items={toasts} onDismiss={dismissToast} />
    </>
  );
}

function ComplianceStat({
  label,
  value,
  total,
}: {
  label: string;
  value: number;
  total: number;
}) {
  const pct = total > 0 ? ((value / total) * 100).toFixed(1) : "0";
  return (
    <div className="rounded-xl border border-[var(--border)] p-4 space-y-1">
      <p className="text-xs text-[var(--foreground)]/60">{label}</p>
      <p className="text-2xl font-bold">{value}</p>
      <p className="text-xs text-[var(--foreground)]/50">{pct}% of all decisions</p>
    </div>
  );
}

function EmptyState() {
  return (
    <div className="text-center py-8 text-sm text-[var(--foreground)]/50">
      <ShieldCheck className="mx-auto size-7 mb-2 text-[var(--brand)]" />
      No transactions yet. Use a payment flow to generate live activity.
    </div>
  );
}
