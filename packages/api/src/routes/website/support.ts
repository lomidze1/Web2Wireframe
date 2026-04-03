import express from "express";
import {
  submitSupportTicket,
  healthCheck,
} from "../../services/supportController.js";
import { supportRateLimiter } from "../../middleware/rateLimit.js";

const router = express.Router();

// Health check
router.get("/health", healthCheck);

// Support ticket submission
router.post("/support", supportRateLimiter, submitSupportTicket);

export default router;
