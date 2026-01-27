export type Plan = "free" | "plus" | "pro";
export type Status = "trial" | "active" | "expired" | "canceled";

export interface License {
  userId: string;
  plan: Plan;
  status: Status;
  expiresAt?: string;
  limits: {
    importsPerDay: number;
    aiGenerationsPerDay: number;
    librarySaves: number;
  };
  usage: {
    importsToday: number;
    aiGenerationsToday: number;
    librarySavesTotal: number;
  };
  updatedAt: string;
}

const BASE_URL = "http://localhost:3003";
const DEV_TOKEN = "dev-token";

export async function fetchMyLicense(
  signal?: AbortSignal,
): Promise<License> {
  const response = await fetch(`${BASE_URL}/me/license`, {
    method: "GET",
    headers: {
      Authorization: `Bearer ${DEV_TOKEN}`,
    },
    signal,
  });

  if (!response.ok) {
    throw new Error(`License request failed (${response.status})`);
  }

  return (await response.json()) as License;
}
