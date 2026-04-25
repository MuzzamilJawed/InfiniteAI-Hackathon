"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import {
  Activity,
  AlertTriangle,
  BarChart3,
  CheckCircle2,
  Lock,
  RefreshCw,
  ShieldAlert,
  ShieldCheck,
  Table2,
  TrendingUp,
  Wifi,
} from "lucide-react";
import {
  PieChart,
  Pie,
  Cell,
  Tooltip,
  ResponsiveContainer,
  AreaChart,
  Area,
  XAxis,
  YAxis,
  CartesianGrid,
  BarChart,
  Bar,
  Legend,
} from "recharts";
import { recentDecisions, type TransactionDecision } from "@/lib/api";
import { useAuth } from "@/context/AuthContext";
import { ToastStack, type ToastItem } from "@/components/Toast";

const BAND_COLOR: Record<string, string> = {
  LOW: "text-emerald-600 bg-emerald-500/10",
  MEDIUM: "text-amber-600 bg-amber-500/10",
  HIGH: "text-orange-600 bg-orange-500/10",
  CRITICAL: "text-red-600 bg-red-500/10",
};

const BAND_HEX: Record<string, string> = {
  LOW: "#10b981",
  MEDIUM: "#f59e0b",
  HIGH: "#f97316",
  CRITICAL: "#ef4444",
};

const ACTION_HEX: Record<string, string> = {
  ALLOW: "#10b981",
  STEP_UP_AUTH: "#f59e0b",
  HOLD_FOR_REVIEW: "#f97316",
  BLOCK: "#ef4444",
};

const ACTION_ICON: Record<string, typeof CheckCircle2> = {
  ALLOW: CheckCircle2,
  STEP_UP_AUTH: ShieldCheck,
  HOLD_FOR_REVIEW: AlertTriangle,
  BLOCK: Lock,
};

const POLL_INTERVAL_MS = 3000;

type ViewMode = "graph" | "text";

export default function DashboardPage() {
  const { user } = useAuth();
  const isStaff = user?.role === "analyst";
  const [allDecisions, setAllDecisions] = useState<TransactionDecision[]>([]);
  const [loading, setLoading] = useState(true);
  const [liveConnected, setLiveConnected] = useState(false);
  const [lastRefresh, setLastRefresh] = useState(new Date());
  const [newIds, setNewIds] = useState<Set<string>>(new Set());
  const [toasts, setToasts] = useState<ToastItem[]>([]);
  const [viewMode, setViewMode] = useState<ViewMode>("graph");
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
      const newToastsArr: ToastItem[] = [];
      data.forEach((d) => {
        if (!knownIds.current.has(d.transaction_id)) {
          incoming.add(d.transaction_id);
          knownIds.current.add(d.transaction_id);
          newToastsArr.push({ id: d.transaction_id, decision: d });
        }
      });
      if (incoming.size > 0 && knownIds.current.size > incoming.size) {
        setNewIds(incoming);
        setToasts((prev) => [...newToastsArr.slice(0, 3), ...prev].slice(0, 5));
        setTimeout(() => setNewIds(new Set()), 3000);
      } else {
        data.forEach((d) => knownIds.current.add(d.transaction_id));
      }
      setAllDecisions(data);
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

  const decisions = useMemo(() => {
    if (isStaff) return allDecisions;
    const myIds = getCustomerIdsForUser(user?.email);
    return allDecisions.filter((d) => myIds.includes(d.customer_id));
  }, [allDecisions, isStaff, user]);

  /* ---------- derived data ---------- */
  const total = decisions.length;
  const blocked = decisions.filter((d) => d.action === "BLOCK").length;
  const held = decisions.filter((d) => d.action === "HOLD_FOR_REVIEW").length;
  const stepUp = decisions.filter((d) => d.action === "STEP_UP_AUTH").length;
  const allowed = decisions.filter((d) => d.action === "ALLOW").length;
  const amlCount = decisions.filter((d) => d.compliance?.aml_review_required).length;
  const avgRisk = total > 0 ? (decisions.reduce((s, d) => s + d.risk_score, 0) / total).toFixed(1) : "—";

  const riskDonutData = useMemo(() => {
    const counts: Record<string, number> = { LOW: 0, MEDIUM: 0, HIGH: 0, CRITICAL: 0 };
    decisions.forEach((d) => { counts[d.risk_band] = (counts[d.risk_band] || 0) + 1; });
    return Object.entries(counts).filter(([, v]) => v > 0).map(([name, value]) => ({ name, value }));
  }, [decisions]);

  const actionDonutData = useMemo(() => {
    const counts: Record<string, number> = {};
    decisions.forEach((d) => { counts[d.action] = (counts[d.action] || 0) + 1; });
    return Object.entries(counts).map(([name, value]) => ({ name: name.replace(/_/g, " "), rawName: name, value }));
  }, [decisions]);

  const channelBarData = useMemo(() => {
    const map: Record<string, { channel: string; LOW: number; MEDIUM: number; HIGH: number; CRITICAL: number }> = {};
    decisions.forEach((d) => {
      const ch = String(d.compliance?.channel ?? "Other");
      if (!map[ch]) map[ch] = { channel: ch, LOW: 0, MEDIUM: 0, HIGH: 0, CRITICAL: 0 };
      map[ch][d.risk_band as "LOW" | "MEDIUM" | "HIGH" | "CRITICAL"]++;
    });
    return Object.values(map).sort((a, b) => (b.LOW + b.MEDIUM + b.HIGH + b.CRITICAL) - (a.LOW + a.MEDIUM + a.HIGH + a.CRITICAL));
  }, [decisions]);

  const scoreTimelineData = useMemo(() => {
    return decisions.slice().sort((a, b) => new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime())
      .map((d, i) => ({ idx: i + 1, risk: Math.round(d.risk_score), anomaly: Math.round(d.anomaly_score), fraud: Math.round(d.fraud_score), customer: d.customer_id }));
  }, [decisions]);

  return (
    <>
      <div className="space-y-6 max-w-7xl mx-auto">
        {/* Header */}
        <div className="flex items-center justify-between flex-wrap gap-3">
          <div>
            <h2 className="text-xl font-semibold">Good day, {user?.name?.split(" ")[0]} 👋</h2>
            <p className="text-sm text-[var(--foreground)]/60">
              {isStaff ? "All customers" : "Your transactions"} · auto-refresh every {POLL_INTERVAL_MS / 1000}s · {lastRefresh.toLocaleTimeString()}
            </p>
          </div>
          <div className="flex items-center gap-2">
            {/* Text / Graph toggle */}
            <div className="flex p-0.5 rounded-xl bg-[var(--surface-muted)] border border-[var(--border)]">
              <button
                type="button"
                onClick={() => setViewMode("graph")}
                className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium transition-colors ${viewMode === "graph" ? "bg-[var(--background)] shadow-sm text-[var(--foreground)]" : "text-[var(--foreground)]/50"}`}
              >
                <BarChart3 className="size-3.5" /> Charts
              </button>
              <button
                type="button"
                onClick={() => setViewMode("text")}
                className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium transition-colors ${viewMode === "text" ? "bg-[var(--background)] shadow-sm text-[var(--foreground)]" : "text-[var(--foreground)]/50"}`}
              >
                <Table2 className="size-3.5" /> Table
              </button>
            </div>

            <div className={`flex items-center gap-1.5 rounded-xl px-3 py-1.5 text-xs font-medium border ${liveConnected ? "bg-emerald-500/10 border-emerald-500/30 text-emerald-600" : "bg-red-500/10 border-red-500/30 text-red-600"}`}>
              <Wifi className="size-3" />
              <span className="relative flex size-2">
                {liveConnected && <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-500 opacity-75" />}
                <span className={`relative inline-flex rounded-full size-2 ${liveConnected ? "bg-emerald-500" : "bg-red-500"}`} />
              </span>
              {liveConnected ? "Live" : "Offline"}
            </div>
            <button type="button" onClick={() => load(false)} className="flex items-center gap-2 text-sm rounded-xl border border-[var(--border)] px-3 py-2 hover:border-[var(--brand)] transition-colors">
              <RefreshCw className={`size-3.5 ${loading ? "animate-spin" : ""}`} /> Refresh
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
            <motion.div key={label} initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: i * 0.05 }} className="glass card-shadow rounded-2xl px-4 py-4 space-y-2">
              <div className="flex items-center justify-between">
                <span className="text-xs text-[var(--foreground)]/60">{label}</span>
                <Icon className="size-3.5 text-[var(--brand)]" />
              </div>
              <div className="text-2xl font-bold">{value}</div>
            </motion.div>
          ))}
        </div>

        {/* Switchable view */}
        <AnimatePresence mode="wait">
          {viewMode === "graph" ? (
            <motion.div key="graph" initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -6 }} className="space-y-4">
              <GraphView
                total={total}
                riskDonutData={riskDonutData}
                actionDonutData={actionDonutData}
                channelBarData={channelBarData}
                scoreTimelineData={scoreTimelineData}
              />
            </motion.div>
          ) : (
            <motion.div key="text" initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -6 }} className="space-y-4">
              <TextView
                riskDonutData={riskDonutData}
                actionDonutData={actionDonutData}
                channelBarData={channelBarData}
                total={total}
              />
            </motion.div>
          )}
        </AnimatePresence>

        {/* Live feed (always visible) */}
        <div className="glass card-shadow rounded-2xl p-5 space-y-3">
          <div className="flex items-center justify-between">
            <h3 className="font-semibold text-sm">Live transaction feed</h3>
            {newIds.size > 0 && (
              <motion.span initial={{ scale: 0.8, opacity: 0 }} animate={{ scale: 1, opacity: 1 }} className="text-[10px] px-2 py-0.5 rounded-full bg-[var(--brand)] text-white font-semibold">
                +{newIds.size} new
              </motion.span>
            )}
          </div>
          {total === 0 ? <EmptyChart /> : (
            <div className="space-y-1.5 max-h-64 overflow-y-auto scrollbar-thin pr-1">
              <AnimatePresence initial={false}>
                {decisions.slice(0, 25).map((d) => {
                  const Icon = ACTION_ICON[d.action] ?? Activity;
                  const isNew = newIds.has(d.transaction_id);
                  return (
                    <motion.div key={d.transaction_id} initial={{ opacity: 0, x: 12 }} animate={{ opacity: 1, x: 0 }} layout
                      className={`flex items-center gap-3 rounded-xl px-3 py-2.5 transition-colors ${isNew ? "bg-[var(--brand)]/10 border border-[var(--brand)]/30" : "hover:bg-[var(--surface-muted)]"}`}
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
                          {isNew && <span className="text-[10px] px-1.5 py-0.5 rounded-full bg-[var(--brand)] text-white font-semibold shrink-0">NEW</span>}
                        </div>
                        <div className="text-[11px] text-[var(--foreground)]/55 truncate mt-0.5">
                          {d.explanation.customer.slice(0, 75)}{d.explanation.customer.length > 75 ? "…" : ""}
                        </div>
                      </div>
                      <div className="text-right shrink-0 space-y-0.5">
                        <div className="text-sm font-bold">{d.risk_score.toFixed(0)}</div>
                        <span className={`text-[10px] px-1.5 py-0.5 rounded-full font-medium ${BAND_COLOR[d.risk_band]}`}>{d.risk_band}</span>
                      </div>
                    </motion.div>
                  );
                })}
              </AnimatePresence>
            </div>
          )}
        </div>

        {/* Compliance summary */}
        <div className="glass card-shadow rounded-2xl p-5 space-y-4">
          <h3 className="font-semibold text-sm">Pakistan compliance summary</h3>
          <div className="grid sm:grid-cols-3 gap-4 text-sm">
            <ComplianceStat label="SBP monitoring flags" value={decisions.filter((d) => d.compliance?.sbp_risk_monitoring_flag).length} total={total} />
            <ComplianceStat label="AML/CFT reviews required" value={amlCount} total={total} />
            <ComplianceStat label="High/Critical + Low KYC" value={decisions.filter((d) => d.compliance?.kyc_tier === "low" && ["HIGH", "CRITICAL"].includes(d.risk_band)).length} total={total} />
          </div>
        </div>
      </div>
      <ToastStack items={toasts} onDismiss={dismissToast} />
    </>
  );
}

/* ============ GRAPH VIEW ============ */
function GraphView({ total, riskDonutData, actionDonutData, channelBarData, scoreTimelineData }: {
  total: number;
  riskDonutData: { name: string; value: number }[];
  actionDonutData: { name: string; rawName: string; value: number }[];
  channelBarData: { channel: string; LOW: number; MEDIUM: number; HIGH: number; CRITICAL: number }[];
  scoreTimelineData: { idx: number; risk: number; anomaly: number; fraud: number; customer: string }[];
}) {
  const ttStyle = { background: "var(--surface)", border: "1px solid var(--border)", borderRadius: "12px", fontSize: "12px" };

  return (
    <>
      <div className="grid lg:grid-cols-3 gap-4">
        <div className="glass card-shadow rounded-2xl p-5 space-y-2">
          <h3 className="font-semibold text-sm">Risk band distribution</h3>
          {total === 0 ? <EmptyChart /> : (
            <ResponsiveContainer width="100%" height={200}>
              <PieChart>
                <Pie data={riskDonutData} cx="50%" cy="50%" innerRadius={50} outerRadius={80} paddingAngle={3} dataKey="value" animationDuration={600}>
                  {riskDonutData.map((e) => <Cell key={e.name} fill={BAND_HEX[e.name]} />)}
                </Pie>
                <Tooltip contentStyle={ttStyle} />
                <Legend iconType="circle" iconSize={8} wrapperStyle={{ fontSize: "11px" }} />
              </PieChart>
            </ResponsiveContainer>
          )}
        </div>
        <div className="glass card-shadow rounded-2xl p-5 space-y-2">
          <h3 className="font-semibold text-sm">Action breakdown</h3>
          {total === 0 ? <EmptyChart /> : (
            <ResponsiveContainer width="100%" height={200}>
              <PieChart>
                <Pie data={actionDonutData} cx="50%" cy="50%" innerRadius={50} outerRadius={80} paddingAngle={3} dataKey="value" animationDuration={600}>
                  {actionDonutData.map((e) => <Cell key={e.rawName} fill={ACTION_HEX[e.rawName] ?? "#94a3b8"} />)}
                </Pie>
                <Tooltip contentStyle={ttStyle} />
                <Legend iconType="circle" iconSize={8} wrapperStyle={{ fontSize: "11px" }} />
              </PieChart>
            </ResponsiveContainer>
          )}
        </div>
        <div className="glass card-shadow rounded-2xl p-5 space-y-2">
          <h3 className="font-semibold text-sm">Score timeline</h3>
          {total === 0 ? <EmptyChart /> : (
            <ResponsiveContainer width="100%" height={200}>
              <AreaChart data={scoreTimelineData}>
                <defs>
                  <linearGradient id="riskGrad" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor="#6366f1" stopOpacity={0.3} />
                    <stop offset="95%" stopColor="#6366f1" stopOpacity={0} />
                  </linearGradient>
                  <linearGradient id="anomalyGrad" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor="#f59e0b" stopOpacity={0.2} />
                    <stop offset="95%" stopColor="#f59e0b" stopOpacity={0} />
                  </linearGradient>
                </defs>
                <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" />
                <XAxis dataKey="idx" tick={{ fontSize: 10 }} stroke="var(--foreground)" opacity={0.4} />
                <YAxis domain={[0, 100]} tick={{ fontSize: 10 }} stroke="var(--foreground)" opacity={0.4} />
                <Tooltip contentStyle={ttStyle} labelFormatter={(v) => `Transaction #${v}`} />
                <Area type="monotone" dataKey="risk" stroke="#6366f1" strokeWidth={2} fill="url(#riskGrad)" dot={false} activeDot={{ r: 4 }} />
                <Area type="monotone" dataKey="anomaly" stroke="#f59e0b" strokeWidth={1.5} fill="url(#anomalyGrad)" dot={false} />
                <Legend iconType="line" iconSize={10} wrapperStyle={{ fontSize: "11px" }} />
              </AreaChart>
            </ResponsiveContainer>
          )}
        </div>
      </div>
      <div className="glass card-shadow rounded-2xl p-5 space-y-2">
        <h3 className="font-semibold text-sm">Risk by channel</h3>
        {total === 0 ? <EmptyChart /> : (
          <ResponsiveContainer width="100%" height={220}>
            <BarChart data={channelBarData} layout="vertical" barCategoryGap="20%">
              <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" />
              <XAxis type="number" tick={{ fontSize: 10 }} stroke="var(--foreground)" opacity={0.4} />
              <YAxis dataKey="channel" type="category" tick={{ fontSize: 10 }} stroke="var(--foreground)" opacity={0.4} width={65} />
              <Tooltip contentStyle={ttStyle} />
              {(["LOW", "MEDIUM", "HIGH", "CRITICAL"] as const).map((b) => <Bar key={b} dataKey={b} stackId="a" fill={BAND_HEX[b]} />)}
              <Legend iconType="circle" iconSize={8} wrapperStyle={{ fontSize: "11px" }} />
            </BarChart>
          </ResponsiveContainer>
        )}
      </div>
    </>
  );
}

/* ============ TEXT / TABLE VIEW ============ */
function TextView({ riskDonutData, actionDonutData, channelBarData, total }: {
  riskDonutData: { name: string; value: number }[];
  actionDonutData: { name: string; rawName: string; value: number }[];
  channelBarData: { channel: string; LOW: number; MEDIUM: number; HIGH: number; CRITICAL: number }[];
  total: number;
}) {
  if (total === 0) return <EmptyChart />;

  return (
    <div className="grid lg:grid-cols-3 gap-4">
      {/* Risk band table */}
      <div className="glass card-shadow rounded-2xl p-5 space-y-3">
        <h3 className="font-semibold text-sm">Risk band distribution</h3>
        <table className="w-full text-xs">
          <thead>
            <tr className="border-b border-[var(--border)]">
              <th className="text-left py-2 font-semibold">Band</th>
              <th className="text-right py-2 font-semibold">Count</th>
              <th className="text-right py-2 font-semibold">%</th>
            </tr>
          </thead>
          <tbody>
            {(["LOW", "MEDIUM", "HIGH", "CRITICAL"] as const).map((band) => {
              const row = riskDonutData.find((r) => r.name === band);
              const count = row?.value ?? 0;
              const pct = total > 0 ? ((count / total) * 100).toFixed(1) : "0";
              return (
                <tr key={band} className="border-b border-[var(--border)]/50">
                  <td className="py-2">
                    <span className={`inline-flex items-center gap-1.5 font-medium ${BAND_COLOR[band]} px-2 py-0.5 rounded-full`}>
                      <span className="size-2 rounded-full" style={{ background: BAND_HEX[band] }} />
                      {band}
                    </span>
                  </td>
                  <td className="text-right py-2 font-bold">{count}</td>
                  <td className="text-right py-2 text-[var(--foreground)]/60">{pct}%</td>
                </tr>
              );
            })}
            <tr className="font-bold">
              <td className="py-2">Total</td>
              <td className="text-right py-2">{total}</td>
              <td className="text-right py-2">100%</td>
            </tr>
          </tbody>
        </table>
      </div>

      {/* Action breakdown table */}
      <div className="glass card-shadow rounded-2xl p-5 space-y-3">
        <h3 className="font-semibold text-sm">Action breakdown</h3>
        <table className="w-full text-xs">
          <thead>
            <tr className="border-b border-[var(--border)]">
              <th className="text-left py-2 font-semibold">Action</th>
              <th className="text-right py-2 font-semibold">Count</th>
              <th className="text-right py-2 font-semibold">%</th>
            </tr>
          </thead>
          <tbody>
            {actionDonutData.map((row) => {
              const pct = total > 0 ? ((row.value / total) * 100).toFixed(1) : "0";
              return (
                <tr key={row.rawName} className="border-b border-[var(--border)]/50">
                  <td className="py-2">
                    <span className="inline-flex items-center gap-1.5 font-medium">
                      <span className="size-2 rounded-full" style={{ background: ACTION_HEX[row.rawName] ?? "#94a3b8" }} />
                      {row.name}
                    </span>
                  </td>
                  <td className="text-right py-2 font-bold">{row.value}</td>
                  <td className="text-right py-2 text-[var(--foreground)]/60">{pct}%</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      {/* Channel risk table */}
      <div className="glass card-shadow rounded-2xl p-5 space-y-3">
        <h3 className="font-semibold text-sm">Risk by channel</h3>
        <div className="overflow-x-auto">
          <table className="w-full text-xs">
            <thead>
              <tr className="border-b border-[var(--border)]">
                <th className="text-left py-2 font-semibold">Channel</th>
                {(["LOW", "MEDIUM", "HIGH", "CRITICAL"] as const).map((b) => (
                  <th key={b} className="text-right py-2 font-semibold">
                    <span className="inline-block size-2 rounded-full mr-1" style={{ background: BAND_HEX[b] }} />
                    {b[0]}
                  </th>
                ))}
                <th className="text-right py-2 font-semibold">Total</th>
              </tr>
            </thead>
            <tbody>
              {channelBarData.map((row) => {
                const sum = row.LOW + row.MEDIUM + row.HIGH + row.CRITICAL;
                return (
                  <tr key={row.channel} className="border-b border-[var(--border)]/50">
                    <td className="py-2 font-medium">{row.channel}</td>
                    <td className="text-right py-2">{row.LOW || "—"}</td>
                    <td className="text-right py-2">{row.MEDIUM || "—"}</td>
                    <td className="text-right py-2">{row.HIGH || "—"}</td>
                    <td className="text-right py-2">{row.CRITICAL || "—"}</td>
                    <td className="text-right py-2 font-bold">{sum}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}

/* ============ HELPERS ============ */

function getCustomerIdsForUser(email?: string): string[] {
  if (email === "customer1@fraudentify.pk") return ["C00123"];
  if (email === "customer2@fraudentify.pk") return ["C00456"];
  return [];
}

function ComplianceStat({ label, value, total }: { label: string; value: number; total: number }) {
  const pct = total > 0 ? ((value / total) * 100).toFixed(1) : "0";
  return (
    <div className="rounded-xl border border-[var(--border)] p-4 space-y-1">
      <p className="text-xs text-[var(--foreground)]/60">{label}</p>
      <p className="text-2xl font-bold">{value}</p>
      <p className="text-xs text-[var(--foreground)]/50">{pct}% of all decisions</p>
    </div>
  );
}

function EmptyChart() {
  return (
    <div className="flex items-center justify-center h-[200px] text-sm text-[var(--foreground)]/40">
      <ShieldCheck className="size-6 mr-2 text-[var(--brand)]/40" />
      No data yet
    </div>
  );
}
