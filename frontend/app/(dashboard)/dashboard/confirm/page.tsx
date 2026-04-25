"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import {
  ShieldCheck,
  ShieldAlert,
  AlertTriangle,
  Loader2,
  RefreshCw,
  ChevronRight,
  CheckCircle2,
  Lock,
  Activity,
  MapPin,
  Clock,
  Fingerprint,
  X,
  Search,
  SlidersHorizontal,
  ChevronDown,
  Banknote,
  Smartphone,
  Globe,
  Gauge,
  Users,
  FileText,
  Brain,
  Sparkles,
  Lightbulb,
} from "lucide-react";
import {
  confirmTransaction,
  recentDecisions,
  type TransactionDecision,
  type RiskBand,
  type Evidence,
  type Severity,
  type EvidenceCategory,
} from "@/lib/api";
import { useAuth } from "@/context/AuthContext";

const BAND_STYLE: Record<string, { bg: string; text: string; dot: string }> = {
  LOW: { bg: "bg-emerald-500/10", text: "text-emerald-700 dark:text-emerald-300", dot: "bg-emerald-500" },
  MEDIUM: { bg: "bg-amber-500/10", text: "text-amber-700 dark:text-amber-300", dot: "bg-amber-500" },
  HIGH: { bg: "bg-orange-500/10", text: "text-orange-700 dark:text-orange-300", dot: "bg-orange-500" },
  CRITICAL: { bg: "bg-red-500/10", text: "text-red-700 dark:text-red-300", dot: "bg-red-500" },
};

const ACTION_ICON: Record<string, typeof CheckCircle2> = {
  ALLOW: CheckCircle2,
  STEP_UP_AUTH: ShieldCheck,
  HOLD_FOR_REVIEW: AlertTriangle,
  BLOCK: Lock,
};

const RISK_BANDS: RiskBand[] = ["LOW", "MEDIUM", "HIGH", "CRITICAL"];
const CHANNELS = ["IBFT", "Raast", "1LINK", "JazzCash", "Easypaisa", "POS", "ATM", "App", "Card"];
const CITIES = ["Karachi", "Lahore", "Islamabad", "Rawalpindi", "Faisalabad", "Peshawar", "Quetta", "Multan", "Hyderabad", "Sialkot"];

type TabFilter = "all" | "flagged" | "allowed";

interface SearchFilters {
  query: string;
  riskBands: RiskBand[];
  channels: string[];
  cities: string[];
  amountMin: string;
  amountMax: string;
  scoreMin: string;
  scoreMax: string;
}

const EMPTY_FILTERS: SearchFilters = {
  query: "",
  riskBands: [],
  channels: [],
  cities: [],
  amountMin: "",
  amountMax: "",
  scoreMin: "",
  scoreMax: "",
};

function hasActiveFilters(f: SearchFilters): boolean {
  return (
    f.query.length > 0 ||
    f.riskBands.length > 0 ||
    f.channels.length > 0 ||
    f.cities.length > 0 ||
    f.amountMin !== "" ||
    f.amountMax !== "" ||
    f.scoreMin !== "" ||
    f.scoreMax !== ""
  );
}

function matchesSearch(item: TransactionDecision, filters: SearchFilters): boolean {
  const q = filters.query.trim().toLowerCase();

  if (q) {
    const haystack = [
      item.transaction_id,
      item.customer_id,
      item.risk_band,
      item.action,
      String(item.compliance?.channel ?? ""),
      String(item.compliance?.city ?? ""),
      String(item.compliance?.home_city ?? ""),
      String(item.compliance?.kyc_tier ?? ""),
      item.explanation?.customer ?? "",
      item.explanation?.analyst ?? "",
      ...item.reason_codes.map((r) => `${r.code} ${r.description}`),
    ]
      .join(" ")
      .toLowerCase();
    if (!haystack.includes(q)) return false;
  }

  if (filters.riskBands.length > 0 && !filters.riskBands.includes(item.risk_band)) return false;
  if (filters.channels.length > 0 && !filters.channels.includes(String(item.compliance?.channel ?? ""))) return false;
  if (filters.cities.length > 0 && !filters.cities.includes(String(item.compliance?.city ?? ""))) return false;

  const amount = item.feature_snapshot?.amount;
  if (filters.amountMin !== "" && amount != null && amount < Number(filters.amountMin)) return false;
  if (filters.amountMax !== "" && amount != null && amount > Number(filters.amountMax)) return false;

  if (filters.scoreMin !== "" && item.risk_score < Number(filters.scoreMin)) return false;
  if (filters.scoreMax !== "" && item.risk_score > Number(filters.scoreMax)) return false;

  return true;
}

export default function ConfirmPage() {
  const { user } = useAuth();
  const isStaff = user?.role === "analyst";

  const [allItems, setAllItems] = useState<TransactionDecision[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [selected, setSelected] = useState<TransactionDecision | null>(null);
  const [tab, setTab] = useState<TabFilter>("flagged");
  const [pendingId, setPendingId] = useState<string | null>(null);
  const [outcome, setOutcome] = useState<Record<string, string>>({});
  const [filters, setFilters] = useState<SearchFilters>(EMPTY_FILTERS);
  const [showFilters, setShowFilters] = useState(false);
  const searchRef = useRef<HTMLInputElement>(null);

  const load = useCallback(async (silent = false) => {
    if (!silent) setLoading(true);
    setError(null);
    try {
      const data = await recentDecisions();
      setAllItems(data);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setLoading(false);
    }
  }, []);

  const items = useMemo(() => {
    if (isStaff) return allItems;
    const myIds = getCustomerIdsForUser(user?.email);
    return allItems.filter((d) => myIds.includes(d.customer_id));
  }, [allItems, isStaff, user]);

  useEffect(() => {
    load();
    const t = setInterval(() => load(true), 4000);
    return () => clearInterval(t);
  }, [load]);

  async function decide(item: TransactionDecision, yes: boolean) {
    setPendingId(item.transaction_id);
    try {
      const res = await confirmTransaction(item.transaction_id, item.customer_id, yes);
      setOutcome((o) => ({ ...o, [item.transaction_id]: res.message }));
    } catch (e) {
      setOutcome((o) => ({ ...o, [item.transaction_id]: (e as Error).message }));
    } finally {
      setPendingId(null);
    }
  }

  const filtered = useMemo(() => {
    let list = items;
    if (tab === "flagged") list = list.filter((i) => i.action !== "ALLOW");
    else if (tab === "allowed") list = list.filter((i) => i.action === "ALLOW");
    if (hasActiveFilters(filters)) list = list.filter((i) => matchesSearch(i, filters));
    return list;
  }, [items, tab, filters]);

  const flaggedCount = items.filter((i) => i.action !== "ALLOW").length;
  const activeFilterCount =
    (filters.riskBands.length > 0 ? 1 : 0) +
    (filters.channels.length > 0 ? 1 : 0) +
    (filters.cities.length > 0 ? 1 : 0) +
    (filters.amountMin || filters.amountMax ? 1 : 0) +
    (filters.scoreMin || filters.scoreMax ? 1 : 0);

  return (
    <div className="h-full flex flex-col gap-4 max-w-7xl mx-auto">
      {/* Header */}
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h2 className="text-xl font-semibold">
            {isStaff ? "Anomaly Transactions" : "Security Alerts"}
          </h2>
          <p className="text-sm text-[var(--foreground)]/60">
            {isStaff
              ? "All scored transactions — click any row to inspect details"
              : "Flagged transactions that need your attention"}
          </p>
        </div>
        <div className="flex items-center gap-2">
          <span className="text-xs text-[var(--foreground)]/50">
            {filtered.length} shown / {items.length} total
          </span>
          <button
            type="button"
            onClick={() => load(false)}
            className="flex items-center gap-1.5 text-sm rounded-xl border border-[var(--border)] px-3 py-2 hover:border-[var(--brand)] transition-colors"
          >
            <RefreshCw className={`size-3.5 ${loading ? "animate-spin" : ""}`} />
            Refresh
          </button>
        </div>
      </div>

      {/* Search bar */}
      <div className="flex flex-col gap-2">
        <div className="flex gap-2">
          <div className="flex-1 relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 size-4 text-[var(--foreground)]/40" />
            <input
              ref={searchRef}
              type="text"
              value={filters.query}
              onChange={(e) => setFilters((f) => ({ ...f, query: e.target.value }))}
              placeholder="Search by Tx ID, customer, channel, city, reason code…"
              className="w-full rounded-xl border border-[var(--border)] bg-[var(--background)] pl-10 pr-10 py-2.5 text-sm placeholder:text-[var(--foreground)]/40 focus:outline-none focus:border-[var(--brand)] focus:ring-1 focus:ring-[var(--brand)]/30 transition-colors"
            />
            {filters.query && (
              <button
                type="button"
                onClick={() => { setFilters((f) => ({ ...f, query: "" })); searchRef.current?.focus(); }}
                className="absolute right-3 top-1/2 -translate-y-1/2 size-5 rounded-full hover:bg-[var(--surface-muted)] grid place-items-center"
              >
                <X className="size-3" />
              </button>
            )}
          </div>
          <button
            type="button"
            onClick={() => setShowFilters((v) => !v)}
            className={`flex items-center gap-1.5 text-sm rounded-xl border px-3 py-2 transition-colors ${showFilters || activeFilterCount > 0
                ? "border-[var(--brand)] bg-[var(--brand)]/5 text-[var(--brand)]"
                : "border-[var(--border)] hover:border-[var(--brand)]"
              }`}
          >
            <SlidersHorizontal className="size-3.5" />
            Filters
            {activeFilterCount > 0 && (
              <span className="min-w-[18px] h-[18px] rounded-full bg-[var(--brand)] text-white text-[10px] font-bold grid place-items-center">
                {activeFilterCount}
              </span>
            )}
          </button>
        </div>

        {/* Expanded filter panel */}
        <AnimatePresence>
          {showFilters && (
            <motion.div
              initial={{ height: 0, opacity: 0 }}
              animate={{ height: "auto", opacity: 1 }}
              exit={{ height: 0, opacity: 0 }}
              transition={{ duration: 0.2 }}
              className="overflow-hidden"
            >
              <div className="rounded-xl border border-[var(--border)] bg-[var(--surface-muted)]/50 p-4 space-y-3">
                <div className="flex items-center justify-between">
                  <span className="text-xs font-semibold uppercase tracking-wider text-[var(--foreground)]/60">Advanced Filters</span>
                  {hasActiveFilters(filters) && (
                    <button
                      type="button"
                      onClick={() => setFilters(EMPTY_FILTERS)}
                      className="text-xs text-red-500 hover:text-red-600 font-medium"
                    >
                      Clear all
                    </button>
                  )}
                </div>

                {/* Risk band chips */}
                <div className="space-y-1.5">
                  <label className="text-[11px] font-medium text-[var(--foreground)]/60">Risk Band</label>
                  <div className="flex flex-wrap gap-1.5">
                    {RISK_BANDS.map((b) => {
                      const active = filters.riskBands.includes(b);
                      const style = BAND_STYLE[b];
                      return (
                        <button
                          key={b}
                          type="button"
                          onClick={() =>
                            setFilters((f) => ({
                              ...f,
                              riskBands: active
                                ? f.riskBands.filter((x) => x !== b)
                                : [...f.riskBands, b],
                            }))
                          }
                          className={`px-2.5 py-1 rounded-lg text-xs font-medium border transition-colors ${active
                              ? `${style.bg} ${style.text} border-current`
                              : "border-[var(--border)] text-[var(--foreground)]/60 hover:border-[var(--foreground)]/30"
                            }`}
                        >
                          {b}
                        </button>
                      );
                    })}
                  </div>
                </div>

                <div className="grid sm:grid-cols-2 gap-3">
                  {/* Channel filter */}
                  <MultiSelect
                    label="Channel"
                    options={CHANNELS}
                    selected={filters.channels}
                    onChange={(v) => setFilters((f) => ({ ...f, channels: v }))}
                  />
                  {/* City filter */}
                  <MultiSelect
                    label="City"
                    options={CITIES}
                    selected={filters.cities}
                    onChange={(v) => setFilters((f) => ({ ...f, cities: v }))}
                  />
                </div>

                <div className="grid sm:grid-cols-2 gap-3">
                  {/* Amount range */}
                  <div className="space-y-1.5">
                    <label className="text-[11px] font-medium text-[var(--foreground)]/60">Amount Range (PKR)</label>
                    <div className="flex gap-2">
                      <input
                        type="number"
                        placeholder="Min"
                        value={filters.amountMin}
                        onChange={(e) => setFilters((f) => ({ ...f, amountMin: e.target.value }))}
                        className="flex-1 rounded-lg border border-[var(--border)] bg-[var(--background)] px-2.5 py-1.5 text-xs focus:outline-none focus:border-[var(--brand)]"
                      />
                      <span className="text-xs text-[var(--foreground)]/40 self-center">–</span>
                      <input
                        type="number"
                        placeholder="Max"
                        value={filters.amountMax}
                        onChange={(e) => setFilters((f) => ({ ...f, amountMax: e.target.value }))}
                        className="flex-1 rounded-lg border border-[var(--border)] bg-[var(--background)] px-2.5 py-1.5 text-xs focus:outline-none focus:border-[var(--brand)]"
                      />
                    </div>
                  </div>
                  {/* Score range */}
                  <div className="space-y-1.5">
                    <label className="text-[11px] font-medium text-[var(--foreground)]/60">Risk Score Range (0-100)</label>
                    <div className="flex gap-2">
                      <input
                        type="number"
                        placeholder="Min"
                        value={filters.scoreMin}
                        onChange={(e) => setFilters((f) => ({ ...f, scoreMin: e.target.value }))}
                        className="flex-1 rounded-lg border border-[var(--border)] bg-[var(--background)] px-2.5 py-1.5 text-xs focus:outline-none focus:border-[var(--brand)]"
                      />
                      <span className="text-xs text-[var(--foreground)]/40 self-center">–</span>
                      <input
                        type="number"
                        placeholder="Max"
                        value={filters.scoreMax}
                        onChange={(e) => setFilters((f) => ({ ...f, scoreMax: e.target.value }))}
                        className="flex-1 rounded-lg border border-[var(--border)] bg-[var(--background)] px-2.5 py-1.5 text-xs focus:outline-none focus:border-[var(--brand)]"
                      />
                    </div>
                  </div>
                </div>
              </div>
            </motion.div>
          )}
        </AnimatePresence>

        {/* Active filter tags (shown when panel is closed) */}
        {!showFilters && hasActiveFilters(filters) && (
          <div className="flex flex-wrap gap-1.5">
            {filters.riskBands.map((b) => (
              <FilterTag key={b} label={b} onRemove={() => setFilters((f) => ({ ...f, riskBands: f.riskBands.filter((x) => x !== b) }))} color={BAND_STYLE[b].text} />
            ))}
            {filters.channels.map((c) => (
              <FilterTag key={c} label={c} onRemove={() => setFilters((f) => ({ ...f, channels: f.channels.filter((x) => x !== c) }))} />
            ))}
            {filters.cities.map((c) => (
              <FilterTag key={c} label={c} onRemove={() => setFilters((f) => ({ ...f, cities: f.cities.filter((x) => x !== c) }))} />
            ))}
            {(filters.amountMin || filters.amountMax) && (
              <FilterTag label={`Amount: ${filters.amountMin || "0"}–${filters.amountMax || "∞"}`} onRemove={() => setFilters((f) => ({ ...f, amountMin: "", amountMax: "" }))} />
            )}
            {(filters.scoreMin || filters.scoreMax) && (
              <FilterTag label={`Score: ${filters.scoreMin || "0"}–${filters.scoreMax || "100"}`} onRemove={() => setFilters((f) => ({ ...f, scoreMin: "", scoreMax: "" }))} />
            )}
            <button
              type="button"
              onClick={() => setFilters(EMPTY_FILTERS)}
              className="text-[10px] text-red-500 hover:text-red-600 font-medium px-2 py-0.5"
            >
              Clear all
            </button>
          </div>
        )}
      </div>

      {/* Tabs */}
      <div className="flex gap-1 p-1 rounded-xl bg-[var(--surface-muted)] w-fit">
        {([
          { key: "flagged", label: "Flagged", count: flaggedCount },
          { key: "all", label: "All", count: items.length },
          { key: "allowed", label: "Allowed", count: items.length - flaggedCount },
        ] as { key: TabFilter; label: string; count: number }[]).map((t) => (
          <button
            key={t.key}
            type="button"
            onClick={() => setTab(t.key)}
            className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-colors ${tab === t.key
                ? "bg-[var(--background)] shadow-sm text-[var(--foreground)]"
                : "text-[var(--foreground)]/60 hover:text-[var(--foreground)]"
              }`}
          >
            {t.label} ({t.count})
          </button>
        ))}
      </div>

      {error && (
        <p className="text-sm text-red-600 bg-red-500/10 rounded-xl p-2">{error}</p>
      )}

      {loading && items.length === 0 ? (
        <div className="flex items-center justify-center py-16 text-[var(--foreground)]/60">
          <Loader2 className="size-5 animate-spin mr-2" /> Loading transactions…
        </div>
      ) : filtered.length === 0 ? (
        hasActiveFilters(filters) ? (
          <div className="text-center py-16">
            <Search className="mx-auto size-8 text-[var(--foreground)]/30" />
            <h3 className="mt-3 font-semibold">No matching transactions</h3>
            <p className="text-sm text-[var(--foreground)]/60 mt-1 max-w-xs mx-auto">
              Try adjusting your search query or filters.
            </p>
            <button
              type="button"
              onClick={() => setFilters(EMPTY_FILTERS)}
              className="mt-3 text-sm text-[var(--brand)] hover:underline font-medium"
            >
              Clear all filters
            </button>
          </div>
        ) : (
          <EmptyState />
        )
      ) : (
        <div className="flex-1 grid lg:grid-cols-5 gap-4 min-h-0">
          {/* List */}
          <div className="lg:col-span-2 overflow-y-auto scrollbar-thin space-y-1.5 pr-1">
            {filtered.map((item, i) => {
              const band = BAND_STYLE[item.risk_band];
              const Icon = ACTION_ICON[item.action] ?? Activity;
              const isActive = selected?.transaction_id === item.transaction_id;
              return (
                <motion.button
                  key={item.transaction_id}
                  type="button"
                  initial={{ opacity: 0, x: -8 }}
                  animate={{ opacity: 1, x: 0 }}
                  transition={{ delay: i * 0.02 }}
                  onClick={() => setSelected(item)}
                  className={`w-full text-left rounded-2xl p-3.5 border transition-all ${isActive
                      ? "border-[var(--brand)] bg-[var(--brand)]/5 shadow-sm"
                      : "border-[var(--border)] hover:border-[var(--brand)]/50 hover:bg-[var(--surface-muted)]"
                    }`}
                >
                  <div className="flex items-center gap-3">
                    <div
                      className={`size-9 rounded-xl grid place-items-center shrink-0 ${band.bg}`}
                    >
                      <Icon className={`size-4 ${band.text}`} />
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2">
                        <span className="text-sm font-medium truncate">
                          {item.customer_id}
                        </span>
                        <span
                          className={`text-[10px] font-bold px-1.5 py-0.5 rounded-full ${band.bg} ${band.text}`}
                        >
                          {item.risk_band}
                        </span>
                      </div>
                      <p className="text-[11px] text-[var(--foreground)]/55 truncate mt-0.5">
                        {String(item.compliance?.channel ?? "—")} · {String(item.compliance?.city ?? "—")} · Score {item.risk_score.toFixed(0)}
                      </p>
                    </div>
                    <ChevronRight className={`size-4 shrink-0 transition-colors ${isActive ? "text-[var(--brand)]" : "text-[var(--foreground)]/30"}`} />
                  </div>
                </motion.button>
              );
            })}
          </div>

          {/* Detail pane */}
          <div className="lg:col-span-3 min-h-0">
            <AnimatePresence mode="wait">
              {selected ? (
                <DetailPane
                  key={selected.transaction_id}
                  item={selected}
                  isStaff={isStaff}
                  outcome={outcome[selected.transaction_id]}
                  pending={pendingId === selected.transaction_id}
                  onDecide={(yes) => decide(selected, yes)}
                  onClose={() => setSelected(null)}
                />
              ) : (
                <motion.div
                  key="empty"
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  className="h-full flex flex-col items-center justify-center text-[var(--foreground)]/40 rounded-2xl border border-dashed border-[var(--border)] p-8"
                >
                  <Activity className="size-8 mb-3 text-[var(--brand)]/40" />
                  <p className="text-sm font-medium">Select a transaction</p>
                  <p className="text-xs mt-1">Click any row to view full details</p>
                </motion.div>
              )}
            </AnimatePresence>
          </div>
        </div>
      )}
    </div>
  );
}

/* ---------- Detail pane ---------- */

function DetailPane({
  item,
  isStaff,
  outcome,
  pending,
  onDecide,
  onClose,
}: {
  item: TransactionDecision;
  isStaff: boolean;
  outcome?: string;
  pending: boolean;
  onDecide: (yes: boolean) => void;
  onClose: () => void;
}) {
  const band = BAND_STYLE[item.risk_band];
  const Icon = ACTION_ICON[item.action] ?? Activity;

  return (
    <motion.div
      initial={{ opacity: 0, y: 6 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: -4 }}
      className="glass card-shadow rounded-2xl border border-[var(--border)] overflow-y-auto scrollbar-thin h-full"
    >
      {/* Header bar */}
      <div className="flex items-center justify-between gap-3 px-5 py-4 border-b border-[var(--border)]">
        <div className="flex items-center gap-3 min-w-0">
          <div className={`size-10 rounded-xl grid place-items-center ${band.bg}`}>
            <Icon className={`size-5 ${band.text}`} />
          </div>
          <div className="min-w-0">
            <div className="flex items-center gap-2 flex-wrap">
              <span className="font-semibold text-sm">{item.customer_id}</span>
              <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full ${band.bg} ${band.text}`}>
                {item.risk_band}
              </span>
              <span className="text-[10px] px-2 py-0.5 rounded-full bg-[var(--surface-muted)] font-medium">
                {item.action.replace(/_/g, " ")}
              </span>
            </div>
            <p className="text-[11px] text-[var(--foreground)]/50 truncate">
              {new Date(item.timestamp).toLocaleString()} · Ref: {item.transaction_id}
            </p>
          </div>
        </div>
        <button
          type="button"
          onClick={onClose}
          className="size-8 rounded-lg grid place-items-center hover:bg-[var(--surface-muted)] shrink-0 lg:hidden"
        >
          <X className="size-4" />
        </button>
      </div>

      <div className="p-5 space-y-5">
        {/* Score chips */}
        <div className="grid grid-cols-3 gap-2 text-center">
          <ScoreChip label="Risk" value={item.risk_score} highlight />
          <ScoreChip label="Anomaly" value={item.anomaly_score} />
          <ScoreChip label="Fraud" value={item.fraud_score} />
        </div>

        {/* Quick facts */}
        <div className="grid grid-cols-2 gap-2">
          <InfoPill icon={MapPin} label="Channel" value={String(item.compliance?.channel ?? "—")} />
          <InfoPill icon={MapPin} label="City" value={String(item.compliance?.city ?? "—")} />
          <InfoPill icon={Clock} label="Timestamp" value={new Date(item.timestamp).toLocaleTimeString()} />
          <InfoPill icon={Fingerprint} label="KYC Tier" value={String(item.compliance?.kyc_tier ?? "—")} />
        </div>

        {/* Reasoning — Headline + Narrative */}
        <div className="space-y-3">
          <h4 className="text-xs font-semibold uppercase tracking-wider text-[var(--foreground)]/60 flex items-center gap-1.5">
            <Brain className="size-3.5" /> Why this decision
          </h4>

          {item.explanation.headline && (
            <div className={`rounded-xl border-l-4 p-3.5 ${band.bg} border-current ${band.text}`}>
              <div className="flex items-start gap-2">
                <Sparkles className="size-4 mt-0.5 shrink-0" />
                <p className="text-sm font-semibold leading-snug">
                  {item.explanation.headline}
                </p>
              </div>
            </div>
          )}

          {/* Customer-friendly version (always shown) */}
          {!isStaff && (
            <div className="rounded-xl bg-[var(--surface-muted)] p-3.5">
              <p className="text-sm leading-relaxed">{item.explanation.customer}</p>
            </div>
          )}

          {/* Analyst narrative (rich) */}
          {isStaff && item.explanation.narrative && (
            <div className="rounded-xl bg-[var(--surface-muted)] p-3.5">
              <p className="text-sm leading-relaxed whitespace-pre-wrap">
                {item.explanation.narrative}
              </p>
            </div>
          )}
        </div>

        {/* Evidence cards — observed vs expected */}
        {item.explanation.evidence && item.explanation.evidence.length > 0 && (
          <div className="space-y-2">
            <h4 className="text-xs font-semibold uppercase tracking-wider text-[var(--foreground)]/60 flex items-center gap-1.5">
              <FileText className="size-3.5" /> Evidence ({item.explanation.evidence.length})
            </h4>
            <div className="grid gap-2">
              {item.explanation.evidence.map((ev, i) => (
                <EvidenceCard key={i} ev={ev} />
              ))}
            </div>
          </div>
        )}

        {/* Recommended action callout */}
        {isStaff && item.explanation.recommended_action && (
          <div className="rounded-xl border border-[var(--brand)]/30 bg-[var(--brand)]/5 p-3.5">
            <div className="flex items-start gap-2">
              <Lightbulb className="size-4 text-[var(--brand)] mt-0.5 shrink-0" />
              <div>
                <p className="text-[11px] font-semibold uppercase tracking-wider text-[var(--brand)]">
                  Recommended action
                </p>
                <p className="text-sm leading-relaxed mt-1">
                  {item.explanation.recommended_action}
                </p>
              </div>
            </div>
          </div>
        )}

        {/* Top ML factors */}
        {item.explanation.top_factors.length > 0 && (
          <div className="space-y-2">
            <h4 className="text-xs font-semibold uppercase tracking-wider text-[var(--foreground)]/60">
              Top ML factors (model importance)
            </h4>
            <ul className="space-y-1">
              {item.explanation.top_factors.map((f, i) => (
                <li
                  key={i}
                  className="text-xs flex items-start gap-2 rounded-lg bg-[var(--surface-muted)] px-3 py-2"
                >
                  <span className="text-[var(--brand)] font-bold mt-px">{i + 1}.</span>
                  <span>{f}</span>
                </li>
              ))}
            </ul>
          </div>
        )}

        {/* Reason codes */}
        {item.reason_codes.length > 0 && (
          <div className="space-y-2">
            <h4 className="text-xs font-semibold uppercase tracking-wider text-[var(--foreground)]/60">
              Reason codes ({item.reason_codes.length})
            </h4>
            <div className="rounded-xl border border-[var(--border)] overflow-hidden">
              <table className="w-full text-xs">
                <thead>
                  <tr className="bg-[var(--surface-muted)]">
                    <th className="text-left px-3 py-2 font-semibold">Code</th>
                    <th className="text-left px-3 py-2 font-semibold">Description</th>
                    <th className="text-right px-3 py-2 font-semibold">Weight</th>
                  </tr>
                </thead>
                <tbody>
                  {item.reason_codes.map((r) => (
                    <tr key={r.code} className="border-t border-[var(--border)]">
                      <td className="px-3 py-2 font-mono font-medium">{r.code}</td>
                      <td className="px-3 py-2 text-[var(--foreground)]/75">{r.description}</td>
                      <td className="px-3 py-2 text-right">{r.weight.toFixed(2)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}

        {/* Feature snapshot */}
        {Object.keys(item.feature_snapshot).length > 0 && (
          <details className="rounded-xl border border-[var(--border)]">
            <summary className="px-3 py-2.5 text-xs font-semibold cursor-pointer select-none uppercase tracking-wider text-[var(--foreground)]/60 hover:bg-[var(--surface-muted)]">
              Feature snapshot ({Object.keys(item.feature_snapshot).length} features)
            </summary>
            <div className="px-3 pb-3 grid grid-cols-2 gap-x-4 gap-y-1 text-xs max-h-48 overflow-y-auto scrollbar-thin">
              {Object.entries(item.feature_snapshot).map(([k, v]) => (
                <div key={k} className="flex justify-between gap-2 py-1 border-b border-[var(--border)]/50">
                  <span className="font-mono text-[var(--foreground)]/60 truncate">{k}</span>
                  <span className="font-semibold shrink-0">{typeof v === "number" ? v.toFixed(2) : String(v)}</span>
                </div>
              ))}
            </div>
          </details>
        )}

        {/* Compliance flags */}
        {isStaff && item.compliance && (
          <div className="space-y-2">
            <h4 className="text-xs font-semibold uppercase tracking-wider text-[var(--foreground)]/60">
              Compliance flags
            </h4>
            <div className="flex flex-wrap gap-2">
              {Boolean(item.compliance.sbp_risk_monitoring_flag) && (
                <ComplianceBadge label="SBP Monitoring" color="orange" />
              )}
              {Boolean(item.compliance.aml_review_required) && (
                <ComplianceBadge label="AML Review" color="red" />
              )}
              <ComplianceBadge label={`KYC: ${String(item.compliance.kyc_tier ?? "—")}`} color="blue" />
              <ComplianceBadge label={`Channel: ${String(item.compliance.channel ?? "—")}`} color="slate" />
            </div>
          </div>
        )}

        {/* Actions (customer confirm/dispute, or staff outcome) */}
        {outcome ? (
          <div className="rounded-2xl bg-emerald-500/10 text-emerald-800 dark:text-emerald-200 p-4 text-sm">
            {outcome}
          </div>
        ) : !isStaff && item.action !== "ALLOW" ? (
          <div className="rounded-2xl border border-[var(--border)] p-4 space-y-3">
            <p className="text-sm font-medium">Was this transaction you?</p>
            <div className="flex gap-2">
              <button
                type="button"
                disabled={pending}
                onClick={() => onDecide(true)}
                className="flex-1 rounded-xl border border-[var(--brand)] text-[var(--brand)] py-2.5 text-sm font-medium hover:bg-[var(--brand)] hover:text-white transition-colors"
              >
                Yes, this was me
              </button>
              <button
                type="button"
                disabled={pending}
                onClick={() => onDecide(false)}
                className="flex-1 rounded-xl bg-red-500/15 text-red-700 dark:text-red-300 py-2.5 text-sm font-medium hover:bg-red-500/25 transition-colors"
              >
                Report fraud
              </button>
            </div>
          </div>
        ) : isStaff && item.action !== "ALLOW" ? (
          <div className="rounded-2xl border border-[var(--border)] p-4 space-y-3">
            <p className="text-sm font-medium">Analyst action</p>
            <div className="flex gap-2">
              <button
                type="button"
                disabled={pending}
                onClick={() => onDecide(true)}
                className="flex-1 rounded-xl border border-emerald-500 text-emerald-700 py-2.5 text-sm font-medium hover:bg-emerald-500 hover:text-white transition-colors"
              >
                Approve / Clear
              </button>
              <button
                type="button"
                disabled={pending}
                onClick={() => onDecide(false)}
                className="flex-1 rounded-xl bg-red-500/15 text-red-700 dark:text-red-300 py-2.5 text-sm font-medium hover:bg-red-500/25 transition-colors"
              >
                Escalate to fraud ops
              </button>
            </div>
          </div>
        ) : null}
      </div>
    </motion.div>
  );
}

/* ---------- Small components ---------- */

const CATEGORY_ICON: Record<EvidenceCategory, typeof Banknote> = {
  Amount: Banknote,
  Time: Clock,
  Location: Globe,
  Device: Smartphone,
  Channel: Activity,
  Velocity: Gauge,
  Beneficiary: Users,
  Compliance: ShieldAlert,
  Behavior: Fingerprint,
  Model: Brain,
};

const SEVERITY_STYLE: Record<Severity, { bg: string; text: string; ring: string; label: string }> = {
  info: { bg: "bg-slate-500/10", text: "text-slate-600 dark:text-slate-300", ring: "ring-slate-500/20", label: "Info" },
  low: { bg: "bg-emerald-500/10", text: "text-emerald-700 dark:text-emerald-300", ring: "ring-emerald-500/20", label: "Low" },
  medium: { bg: "bg-amber-500/10", text: "text-amber-700 dark:text-amber-300", ring: "ring-amber-500/20", label: "Medium" },
  high: { bg: "bg-orange-500/10", text: "text-orange-700 dark:text-orange-300", ring: "ring-orange-500/20", label: "High" },
  critical: { bg: "bg-red-500/10", text: "text-red-700 dark:text-red-300", ring: "ring-red-500/20", label: "Critical" },
};

function EvidenceCard({ ev }: { ev: Evidence }) {
  const Icon = CATEGORY_ICON[ev.category] ?? Activity;
  const sev = SEVERITY_STYLE[ev.severity] ?? SEVERITY_STYLE.info;

  return (
    <div className={`rounded-xl border border-[var(--border)] bg-[var(--surface-muted)]/50 p-3 ring-1 ${sev.ring}`}>
      <div className="flex items-start gap-3">
        <div className={`size-8 rounded-lg grid place-items-center shrink-0 ${sev.bg} ${sev.text}`}>
          <Icon className="size-4" />
        </div>
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <span className="text-xs font-semibold">{ev.title}</span>
            <span className="text-[10px] font-medium px-1.5 py-0.5 rounded-full bg-[var(--background)] border border-[var(--border)] text-[var(--foreground)]/60">
              {ev.category}
            </span>
            <span className={`text-[10px] font-bold px-1.5 py-0.5 rounded-full ${sev.bg} ${sev.text}`}>
              {sev.label}
            </span>
          </div>
          <p className="text-[11px] text-[var(--foreground)]/70 mt-1 leading-relaxed">{ev.detail}</p>
          {(ev.observed || ev.expected) && (
            <div className="grid grid-cols-2 gap-2 mt-2 pt-2 border-t border-[var(--border)]/60">
              <div>
                <div className="text-[9px] uppercase tracking-wider text-[var(--foreground)]/40 font-semibold">Observed</div>
                <div className="text-xs font-medium mt-0.5 truncate">{ev.observed ?? "—"}</div>
              </div>
              <div>
                <div className="text-[9px] uppercase tracking-wider text-[var(--foreground)]/40 font-semibold">Expected</div>
                <div className="text-xs text-[var(--foreground)]/70 mt-0.5 truncate">{ev.expected ?? "—"}</div>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

function ScoreChip({ label, value, highlight }: { label: string; value: number; highlight?: boolean }) {
  return (
    <div className={`rounded-2xl px-3 py-2 ${highlight ? "brand-gradient text-white" : "bg-[var(--surface-muted)]"}`}>
      <div className="text-[10px] uppercase tracking-wider opacity-80">{label}</div>
      <div className="text-lg font-semibold">{value.toFixed(0)}</div>
    </div>
  );
}

function InfoPill({ icon: Icon, label, value }: { icon: typeof MapPin; label: string; value: string }) {
  return (
    <div className="flex items-center gap-2 rounded-xl bg-[var(--surface-muted)] px-3 py-2">
      <Icon className="size-3.5 text-[var(--foreground)]/50 shrink-0" />
      <div className="min-w-0">
        <div className="text-[10px] text-[var(--foreground)]/50">{label}</div>
        <div className="text-xs font-medium truncate">{value}</div>
      </div>
    </div>
  );
}

function ComplianceBadge({ label, color }: { label: string; color: string }) {
  const colors: Record<string, string> = {
    red: "bg-red-500/10 text-red-700 dark:text-red-300 border-red-500/20",
    orange: "bg-orange-500/10 text-orange-700 dark:text-orange-300 border-orange-500/20",
    blue: "bg-blue-500/10 text-blue-700 dark:text-blue-300 border-blue-500/20",
    slate: "bg-slate-500/10 text-slate-700 dark:text-slate-300 border-slate-500/20",
  };
  return (
    <span className={`text-[10px] font-medium px-2 py-1 rounded-full border ${colors[color] ?? colors.slate}`}>
      {label}
    </span>
  );
}

function EmptyState() {
  return (
    <div className="text-center py-16">
      <ShieldCheck className="mx-auto size-8 text-[var(--brand)]" />
      <h3 className="mt-3 font-semibold">No transactions found</h3>
      <p className="text-sm text-[var(--foreground)]/60 mt-1 max-w-xs mx-auto">
        Use a payment flow to generate activity, then come back here to inspect anomalies.
      </p>
    </div>
  );
}

function FilterTag({ label, onRemove, color }: { label: string; onRemove: () => void; color?: string }) {
  return (
    <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-lg text-[11px] font-medium bg-[var(--surface-muted)] border border-[var(--border)] ${color ?? "text-[var(--foreground)]/80"}`}>
      {label}
      <button type="button" onClick={onRemove} className="hover:text-red-500 transition-colors">
        <X className="size-3" />
      </button>
    </span>
  );
}

function MultiSelect({
  label,
  options,
  selected,
  onChange,
}: {
  label: string;
  options: string[];
  selected: string[];
  onChange: (v: string[]) => void;
}) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    function handleClick(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    }
    document.addEventListener("mousedown", handleClick);
    return () => document.removeEventListener("mousedown", handleClick);
  }, []);

  return (
    <div className="space-y-1.5">
      <label className="text-[11px] font-medium text-[var(--foreground)]/60">{label}</label>
      <div ref={ref} className="relative">
        <button
          type="button"
          onClick={() => setOpen((v) => !v)}
          className="w-full flex items-center justify-between rounded-lg border border-[var(--border)] bg-[var(--background)] px-2.5 py-1.5 text-xs focus:outline-none focus:border-[var(--brand)] transition-colors"
        >
          <span className={selected.length ? "text-[var(--foreground)]" : "text-[var(--foreground)]/40"}>
            {selected.length ? `${selected.length} selected` : `All ${label}s`}
          </span>
          <ChevronDown className={`size-3 transition-transform ${open ? "rotate-180" : ""}`} />
        </button>
        <AnimatePresence>
          {open && (
            <motion.div
              initial={{ opacity: 0, y: 4 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: 4 }}
              className="absolute z-20 mt-1 w-full rounded-xl border border-[var(--border)] bg-[var(--background)] shadow-lg max-h-48 overflow-y-auto scrollbar-thin p-1"
            >
              {options.map((opt) => {
                const active = selected.includes(opt);
                return (
                  <button
                    key={opt}
                    type="button"
                    onClick={() =>
                      onChange(active ? selected.filter((x) => x !== opt) : [...selected, opt])
                    }
                    className={`w-full text-left px-2.5 py-1.5 text-xs rounded-lg transition-colors ${active
                        ? "bg-[var(--brand)]/10 text-[var(--brand)] font-medium"
                        : "hover:bg-[var(--surface-muted)] text-[var(--foreground)]/70"
                      }`}
                  >
                    <span className="inline-flex items-center gap-2">
                      <span className={`size-3.5 rounded border grid place-items-center text-[8px] ${active ? "bg-[var(--brand)] border-[var(--brand)] text-white" : "border-[var(--border)]"}`}>
                        {active ? "✓" : ""}
                      </span>
                      {opt}
                    </span>
                  </button>
                );
              })}
            </motion.div>
          )}
        </AnimatePresence>
      </div>
    </div>
  );
}

function getCustomerIdsForUser(email?: string): string[] {
  if (email === "customer1@fraudentify.pk") return ["C00123"];
  if (email === "customer2@fraudentify.pk") return ["C00456"];
  return [];
}
