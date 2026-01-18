export type SupportPlan = "Free" | "Plus" | "Pro";

export interface SupportTicket {
  name: string;
  email: string;
  topic: string;
  message: string;
  selectedPlan?: string;
  figmaUserId?: string;
}

export interface SupportTicketWithMetadata extends SupportTicket {
  plan: SupportPlan;
  planVerified: boolean;
  ipAddress: string;
  userAgent: string;
  timestamp: string;
  ticketId: string;
}

export interface ApiResponse<T = unknown> {
  success: boolean;
  message?: string;
  error?: string;
  data?: T;
}

export interface EmailPayload {
  to: string;
  from: string;
  subject: string;
  html: string;
  text: string;
  replyTo?: string;
}
