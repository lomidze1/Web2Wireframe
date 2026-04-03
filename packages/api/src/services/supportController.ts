import type { Request, Response } from "express";
import {
  validateSupportTicket,
  type SupportTicketInput,
} from "../middleware/validation.js";
import { determinePlanTier } from "./planService.js";
import {
  sendSupportEmail,
  generateSupportEmailHtml,
  generateSupportEmailText,
  generateCustomerConfirmationHtml,
  generateCustomerConfirmationText,
} from "./emailService.js";
import {
  getClientIp,
  getCurrentTimestamp,
  generateTicketId,
} from "./ipService.js";
import { config } from "../config/env.js";
import { asyncHandler } from "../middleware/errorHandler.js";
import type { ApiResponse } from "../config/website-types.js";

export const submitSupportTicket = asyncHandler(
  async (req: Request, res: Response): Promise<void> => {
    // Validate input
    const validation = validateSupportTicket(req.body);
    if (!validation.success) {
      const fields = (validation.errors || []).reduce<Record<string, string>>(
        (acc, current) => {
          if (
            current.field === "name" ||
            current.field === "email" ||
            current.field === "topic" ||
            current.field === "message"
          ) {
            acc[current.field] = current.message;
          }
          return acc;
        },
        {}
      );

      res.status(400).json({
        success: false,
        error: "Please check the highlighted fields.",
        errors: validation.errors,
        fields,
      } as ApiResponse);
      return;
    }

    const input: SupportTicketInput = validation.data!;

    // Gather metadata
    const ipAddress = getClientIp(req);
    const timestamp = getCurrentTimestamp();
    const ticketId = generateTicketId();

    // Determine plan tier (server-side)
    const planResult = await determinePlanTier(
      input.email,
      input.figmaUserId,
      input.selectedPlan
    );

    // Prepare email
    const htmlEmail = generateSupportEmailHtml({
      name: input.name,
      email: input.email,
      topic: input.topic,
      message: input.message,
      plan: planResult.tier,
      planVerified: planResult.verified,
      figmaUserId: input.figmaUserId,
      timestamp,
      ipAddress,
    });

    const textEmail = generateSupportEmailText({
      name: input.name,
      email: input.email,
      topic: input.topic,
      message: input.message,
      plan: planResult.tier,
      planVerified: planResult.verified,
      figmaUserId: input.figmaUserId,
      timestamp,
      ipAddress,
    });

    // Send email to support inbox
    try {
      await sendSupportEmail({
        to: config.email.supportToEmail,
        from: config.email.noreplyEmail,
        subject: `[Support][${planResult.tier}] ${input.topic} - from ${input.name}`,
        html: htmlEmail,
        text: textEmail,
        replyTo: input.email,
      });
    } catch (error) {
      console.error("[Support] Email send failed:", error);
      // Don't fail the request if email fails - ticket was validated
      // In production, implement a retry queue
    }

    // Send confirmation email to the customer
    try {
      await sendSupportEmail({
        to: input.email,
        from: config.email.noreplyEmail,
        subject: `[Web2Wireframe] We received your support request (Ticket: ${ticketId})`,
        html: generateCustomerConfirmationHtml({
          name: input.name,
          topic: input.topic,
          ticketId,
          plan: planResult.tier,
          planVerified: planResult.verified,
        }),
        text: generateCustomerConfirmationText({
          name: input.name,
          topic: input.topic,
          ticketId,
          plan: planResult.tier,
          planVerified: planResult.verified,
        }),
        // Replies should reach the support inbox for follow-ups.
        replyTo: config.email.supportToEmail,
      });
    } catch (error) {
      console.error("[Support] Confirmation email failed:", error);
    }

    // Success response
    res.status(200).json({
      success: true,
      message: "Support ticket submitted successfully",
      data: {
        ticketId,
        plan: planResult.tier,
        planVerified: planResult.verified,
      },
    } as ApiResponse);

  }
);

export const healthCheck = (_req: Request, res: Response) => {
  res.status(200).json({
    success: true,
    message: "Support API is running",
    timestamp: getCurrentTimestamp(),
  });
};
