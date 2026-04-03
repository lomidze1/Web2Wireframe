import { z } from "zod";

export const supportTicketSchema = z.object({
  name: z
    .string()
    .min(2, "Name must be at least 2 characters")
    .max(100, "Name must be less than 100 characters")
    .regex(/^[a-zA-Z\s'-]+$/, "Name contains invalid characters"),
  email: z
    .string()
    .email("Invalid email address")
    .max(255, "Email must be less than 255 characters"),
  topic: z
    .string()
    .min(3, "Topic must be at least 3 characters")
    .max(100, "Topic must be less than 100 characters"),
  message: z
    .string()
    .min(10, "Message must be at least 10 characters")
    .max(5000, "Message must be less than 5000 characters"),
  selectedPlan: z.enum(["Free", "Plus", "Pro"]).optional(),
  figmaUserId: z.string().max(255).optional(),
});

export type SupportTicketInput = z.infer<typeof supportTicketSchema>;

export const validateSupportTicket = (data: unknown) => {
  try {
    return {
      success: true,
      data: supportTicketSchema.parse(data),
      errors: null,
    };
  } catch (error) {
    if (error instanceof z.ZodError) {
      return {
        success: false,
        data: null,
        errors: error.errors.map((e) => ({
          field: e.path.join("."),
          message: e.message,
        })),
      };
    }
    return {
      success: false,
      data: null,
      errors: [{ field: "unknown", message: "Validation failed" }],
    };
  }
};
