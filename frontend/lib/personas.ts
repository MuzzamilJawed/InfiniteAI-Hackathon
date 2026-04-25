import type { ScoreRequest } from "./api";

export interface Persona {
  id: string;
  label: string;
  description: string;
  defaults: Partial<ScoreRequest>;
  riskHint: "LOW" | "MEDIUM" | "HIGH" | "CRITICAL";
}

export const PERSONAS: Persona[] = [
  {
    id: "trusted_karachi",
    label: "Trusted Karachi user",
    description: "Long history, trusted device, medium KYC, predictable spend.",
    riskHint: "LOW",
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
    id: "new_lahore",
    label: "New Lahore user",
    description: "Low KYC, limited history, more sensitive to anomalies.",
    riskHint: "MEDIUM",
    defaults: {
      customer_id: "C00777",
      home_city: "Lahore",
      city: "Lahore",
      device: "new_device",
      kyc_tier: "low",
      avg_user_amount: 1500,
      tx_velocity: 1,
      tx_history: 22,
    },
  },
  {
    id: "drift_quetta",
    label: "Drift user (Quetta)",
    description:
      "Sudden behavior change, large amounts on emulated device, off-pattern.",
    riskHint: "HIGH",
    defaults: {
      customer_id: "C00911",
      home_city: "Karachi",
      city: "Quetta",
      device: "emulated_device",
      kyc_tier: "low",
      avg_user_amount: 1800,
      tx_velocity: 22,
      tx_history: 35,
    },
  },
];

export function findPersona(id: string): Persona | undefined {
  return PERSONAS.find((p) => p.id === id);
}
