/**
 * Interactive Flitt webhook simulator.
 *
 * Builds a properly-signed Flitt-shaped webhook for a chosen scenario and
 * POSTs it to a running API. Useful for:
 *   - manual debugging of webhook handler behavior without waiting on Flitt
 *   - reproducing a customer-reported state quickly
 *   - smoke-testing a fresh deploy ("did the webhook route survive?")
 *
 * Required env:
 *   FLITT_SECRET_KEY  — same key the running API uses
 *
 * Optional env:
 *   E2E_API_URL  — default http://localhost:3002
 *
 * Usage:
 *   tsx scripts/simulate-flitt-webhook.ts \
 *     --type=approved --user=test123 --email=me@example.com
 *
 *   tsx scripts/simulate-flitt-webhook.ts --type=reversed --user=test123 \
 *     --order=w2w_pro_test123_1715000000000
 *
 *   tsx scripts/simulate-flitt-webhook.ts --type=declined --user=test123
 *
 * Flags:
 *   --type=approved|declined|expired|reversed|processing  (required)
 *   --user=<figmaUserId>                                   (required)
 *   --order=<orderId>                                      (optional; auto-generated)
 *   --email=<sender_email>                                 (optional)
 *   --amount=<cents>                                       (default 1600)
 *   --recurring                                            (omit `recurring:false` from merchant_data — subscription mode)
 *   --parent=<parent_order_id>                             (subscription renewal flag)
 *   --bad-signature                                        (use wrong secret — verify rejection path)
 */
import { flittSign } from "../src/services/flittService.js";
import { PLAN_PRICES } from "../src/models/License.js";

const API = process.env.E2E_API_URL ?? "http://localhost:3002";
const SECRET = process.env.FLITT_SECRET_KEY;

if (!SECRET) {
  console.error("FLITT_SECRET_KEY is required. Aborting.");
  process.exit(2);
}

type Args = {
  type?: string;
  user?: string;
  order?: string;
  email?: string;
  amount?: string;
  recurring?: boolean;
  parent?: string;
  badSignature?: boolean;
};

function parseArgs(): Args {
  const out: Args = {};
  for (const arg of process.argv.slice(2)) {
    if (!arg.startsWith("--")) continue;
    const [key, ...rest] = arg.slice(2).split("=");
    const value = rest.join("=");
    switch (key) {
      case "type":
        out.type = value;
        break;
      case "user":
        out.user = value;
        break;
      case "order":
        out.order = value;
        break;
      case "email":
        out.email = value;
        break;
      case "amount":
        out.amount = value;
        break;
      case "recurring":
        out.recurring = true;
        break;
      case "parent":
        out.parent = value;
        break;
      case "bad-signature":
        out.badSignature = true;
        break;
    }
  }
  return out;
}

function usage(): never {
  console.error(`Usage:
  tsx scripts/simulate-flitt-webhook.ts --type=<status> --user=<figmaUserId> [...]

Required flags:
  --type    approved | declined | expired | reversed | processing
  --user    figmaUserId

Optional flags:
  --order            full order_id (default: w2w_pro_<user>_<now>)
  --email            sender_email (e.g. user@example.com)
  --amount           cents (default 1600)
  --recurring        omit recurring:false in merchant_data (subscription mode)
  --parent           parent_order_id (recurring renewal)
  --bad-signature    sign with wrong secret (verifies rejection)

Examples:
  tsx scripts/simulate-flitt-webhook.ts --type=approved --user=u-1 --email=u@x.com
  tsx scripts/simulate-flitt-webhook.ts --type=reversed --user=u-1 --order=w2w_pro_u-1_123
  tsx scripts/simulate-flitt-webhook.ts --type=declined --user=u-1 --bad-signature
`);
  process.exit(2);
}

const args = parseArgs();
const VALID_TYPES = new Set([
  "approved",
  "declined",
  "expired",
  "reversed",
  "processing",
]);

if (!args.type || !VALID_TYPES.has(args.type)) {
  console.error(`Invalid --type "${args.type ?? ""}".`);
  usage();
}
if (!args.user) {
  console.error("--user is required.");
  usage();
}

const figmaUserId = args.user;
const orderId =
  args.order ??
  `w2w_pro_${figmaUserId.replace(/[^A-Za-z0-9_-]/g, "")}_${Date.now()}`;
const amount = args.amount ? Number(args.amount) : PLAN_PRICES.pro.priceCents;
const merchantData: Record<string, unknown> = {
  figmaUserId,
  plan: "pro",
};
if (!args.recurring) {
  merchantData.recurring = false;
}

const payload: Record<string, unknown> = {
  order_id: orderId,
  order_status: args.type,
  amount,
  currency: "USD",
  payment_id: `pay_sim_${Date.now()}`,
  merchant_data: JSON.stringify(merchantData),
};
if (args.email) {
  payload.sender_email = args.email;
}
if (args.parent) {
  payload.parent_order_id = args.parent;
}

const secretForSigning = args.badSignature ? "wrong-secret-for-testing" : SECRET;
const signature = flittSign(payload, secretForSigning);
const body = { ...payload, signature };

console.log(`POST ${API}/api/webhooks/flitt`);
console.log("Payload:", JSON.stringify(body, null, 2));

const res = await fetch(`${API}/api/webhooks/flitt`, {
  method: "POST",
  headers: { "Content-Type": "application/json" },
  body: JSON.stringify(body),
});
const respBody = await res.text();
console.log(`\nResponse ${res.status}:`, respBody);

if (args.badSignature) {
  console.log(
    "\nNote: with --bad-signature the API should respond 200 + {received:true} but NOT change state.",
  );
}
