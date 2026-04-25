"use client";

export type Channel =
  | "IBFT"
  | "Raast"
  | "1LINK"
  | "JazzCash"
  | "Easypaisa"
  | "POS"
  | "ATM"
  | "App"
  | "Card";

export type City =
  | "Karachi"
  | "Lahore"
  | "Islamabad"
  | "Rawalpindi"
  | "Faisalabad"
  | "Peshawar"
  | "Quetta"
  | "Multan"
  | "Hyderabad"
  | "Sialkot";

export type DeviceType = "trusted_device" | "new_device" | "emulated_device";
export type KycTier = "low" | "medium" | "high";
export type RiskBand = "LOW" | "MEDIUM" | "HIGH" | "CRITICAL";
export type Action =
  | "ALLOW"
  | "STEP_UP_AUTH"
  | "HOLD_FOR_REVIEW"
  | "BLOCK";

export type MerchantCategory =
  | "Groceries"
  | "Utilities"
  | "Travel"
  | "Electronics"
  | "Cash"
  | "P2P"
  | "Fuel"
  | "Dining"
  | "Healthcare"
  | "Education"
  | "Others";

export interface ScoreRequest {
  customer_id: string;
  amount: number;
  channel: Channel;
  city: City;
  home_city: City;
  device?: DeviceType;
  new_beneficiary?: boolean;
  merchant_category?: MerchantCategory;
  kyc_tier?: KycTier;
  timestamp?: string;
  avg_user_amount?: number;
  tx_velocity?: number;
  tx_history?: number;
}

export interface ReasonCode {
  code: string;
  description: string;
  weight: number;
}

export interface Explanation {
  analyst: string;
  customer: string;
  top_factors: string[];
}

export interface TransactionDecision {
  transaction_id: string;
  customer_id: string;
  timestamp: string;
  anomaly_score: number;
  fraud_score: number;
  risk_score: number;
  risk_band: RiskBand;
  action: Action;
  reason_codes: ReasonCode[];
  explanation: Explanation;
  feature_snapshot: Record<string, number>;
  compliance: Record<string, unknown>;
}

export interface ConfirmationResponse {
  transaction_id: string;
  status: "CONFIRMED" | "DISPUTED" | "ESCALATED";
  message: string;
  case_id?: string;
}

const API_BASE =
  process.env.NEXT_PUBLIC_API_BASE_URL ?? "http://localhost:8000";

async function call<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(`${API_BASE}${path}`, {
    ...init,
    headers: {
      "Content-Type": "application/json",
      ...(init?.headers ?? {}),
    },
    cache: "no-store",
  });
  if (!res.ok) {
    const text = await res.text().catch(() => "");
    throw new Error(`API ${path} failed (${res.status}): ${text}`);
  }
  return (await res.json()) as T;
}

export function scoreTransaction(
  payload: ScoreRequest
): Promise<TransactionDecision> {
  return call<TransactionDecision>("/score-transaction", {
    method: "POST",
    body: JSON.stringify(payload),
  });
}

export function confirmTransaction(
  transaction_id: string,
  customer_id: string,
  confirmed: boolean
): Promise<ConfirmationResponse> {
  return call<ConfirmationResponse>("/confirm-transaction", {
    method: "POST",
    body: JSON.stringify({ transaction_id, customer_id, confirmed }),
  });
}

export function recentDecisions(): Promise<TransactionDecision[]> {
  return call<TransactionDecision[]>("/recent-decisions");
}

export const PAKISTAN_CITIES: City[] = [
  "Karachi",
  "Lahore",
  "Islamabad",
  "Rawalpindi",
  "Faisalabad",
  "Peshawar",
  "Quetta",
  "Multan",
  "Hyderabad",
  "Sialkot",
];

export const ONLINE_CHANNELS: Channel[] = [
  "IBFT",
  "Raast",
  "1LINK",
  "JazzCash",
  "Easypaisa",
];

export const MERCHANT_CATEGORIES: MerchantCategory[] = [
  "Groceries",
  "Utilities",
  "Travel",
  "Electronics",
  "Cash",
  "P2P",
  "Fuel",
  "Dining",
  "Healthcare",
  "Education",
  "Others",
];
