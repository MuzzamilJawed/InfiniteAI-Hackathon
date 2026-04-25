import type { ScoreRequest } from "./api";

export interface Persona {
  id: string;
  label: string;
  description: string;
  defaults: Partial<ScoreRequest>;
  riskHint: "LOW" | "MEDIUM" | "HIGH" | "CRITICAL";
  owner?: string;
}

export const PERSONAS: Persona[] = [
  {
    id: "customer1",
    label: "Customer 1 — Karachi",
    description: "Karachi-based account, medium KYC, trusted device, healthy history.",
    riskHint: "LOW",
    owner: "customer1@fraudentify.pk",
    defaults: {
      customer_id: "C00123",
      home_city: "Karachi",
      city: "Karachi",
      device: "trusted_device",
      kyc_tier: "medium",
      avg_user_amount: 4500,
      tx_velocity: 3,
      tx_history: 850,
    },
  },
  {
    id: "customer2",
    label: "Customer 2 — Lahore",
    description: "Established Lahore customer, high KYC, trusted device, moderate spend.",
    riskHint: "LOW",
    owner: "customer2@fraudentify.pk",
    defaults: {
      customer_id: "C00456",
      home_city: "Lahore",
      city: "Lahore",
      device: "trusted_device",
      kyc_tier: "high",
      avg_user_amount: 6000,
      tx_velocity: 5,
      tx_history: 420,
    },
  },
];

export function findPersona(id: string): Persona | undefined {
  return PERSONAS.find((p) => p.id === id);
}

export function findPersonaForUser(email?: string | null): Persona | undefined {
  if (!email) return undefined;
  return PERSONAS.find((p) => p.owner === email);
}
