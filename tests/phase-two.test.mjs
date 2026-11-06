import assert from "node:assert/strict";
import { test } from "node:test";
import { createAssistantSession, verifyAssistantSession } from "../lib/assistant-session.ts";
import {
  hasExplicitContactConsent,
  hasExplicitUpdatesConsent,
  onlyKeepUserSuppliedFields,
  requestedAction,
  wasContactProvidedByUser,
} from "../lib/assistant-consent.ts";
import { validateLeadInput } from "../lib/lead-validation.ts";
import { escapeLike, parsePropertyFilters } from "../lib/property-filters.ts";
import { parseProviderToolCalls, providerErrorResponse } from "../lib/assistant-provider.ts";
import { hasAgencyAdminClaim } from "../lib/agency-admin-claims.ts";

test("property search validates and preserves supported filters", () => {
  assert.deepEqual(
    parsePropertyFilters({
      location: "Fairview",
      min_price: 200000,
      max_price: 800000,
      property_type: "single-family",
      listing_status: "active",
      bedrooms_min: 3,
      limit: 8,
    }),
    {
      location: "Fairview",
      min_price: 200000,
      max_price: 800000,
      property_type: "single-family",
      listing_status: "active",
      bedrooms_min: 3,
      limit: 8,
    },
  );
  assert.equal(parsePropertyFilters({ min_price: 900000, max_price: 100000 }), null);
  assert.equal(parsePropertyFilters({ bedrooms_min: 2.5 }), null);
  assert.equal(parsePropertyFilters({ limit: 11 }), null);
  assert.equal(escapeLike("%_\\town"), "\\%\\_\\\\town");
});

test("assistant lead capture requires reachable contact and explicit consent", () => {
  const valid = validateLeadInput(
    {
      first_name: "Jordan",
      email: "jordan@example.test",
      lead_type: "buyer",
      consent_to_contact: true,
      budget_min: 200000,
      budget_max: 500000,
    },
    { assistant: true },
  );
  assert.equal(valid.success, true);
  assert.equal(
    validateLeadInput(
      { email: "jordan@example.test", consent_to_contact: false },
      { assistant: true },
    ).success,
    false,
  );
  assert.equal(
    validateLeadInput(
      { phone_number: "1234", consent_to_contact: true },
      { assistant: true },
    ).success,
    false,
  );
  assert.equal(
    validateLeadInput(
      { email: "not-an-email", consent_to_contact: true },
      { assistant: true },
    ).success,
    false,
  );
});

test("lead validation rejects invalid budget ranges and status values", () => {
  assert.equal(
    validateLeadInput({ budget_min: 600000, budget_max: 300000 }).success,
    false,
  );
  assert.equal(
    validateLeadInput({ lead_status: "deleted" }, { allowLeadStatus: true }).success,
    false,
  );
  assert.equal(
    validateLeadInput({ lead_status: "qualified" }, { allowLeadStatus: true }).success,
    true,
  );
});

test("assistant conversation tokens are signed and tamper evident", () => {
  process.env.ASSISTANT_SESSION_SECRET = "test-only-session-secret-with-at-least-32-chars";
  const session = createAssistantSession();
  assert.equal(verifyAssistantSession(session.sessionToken), session.sessionId);
  assert.equal(verifyAssistantSession(`${session.sessionId}.invalid-signature`), null);
  assert.equal(verifyAssistantSession("not-a-session-token"), null);
});

test("assistant lead capture verifies consent, user-supplied details, and request type", () => {
  const messages = [
    { role: "assistant", content: "May the agency contact you about this viewing?" },
    {
      role: "user",
      content: "Yes, I consent. I'm Jordan, looking to buy in Fairview with 3 bedrooms. Email me at jordan@example.test and schedule a viewing.",
    },
  ];
  assert.equal(hasExplicitContactConsent(messages), true);
  assert.equal(wasContactProvidedByUser("email", "jordan@example.test", messages), true);
  assert.equal(wasContactProvidedByUser("email", "made-up@example.test", messages), false);
  assert.equal(requestedAction(messages), "viewing");
  assert.deepEqual(
    onlyKeepUserSuppliedFields(
      {
        first_name: "Jordan",
        preferred_location: "Fairview",
        bedrooms_required: 3,
        notes: "This was never stated.",
      },
      messages,
    ),
    {
      first_name: "Jordan",
      preferred_location: "Fairview",
      bedrooms_required: 3,
    },
  );
  assert.equal(hasExplicitContactConsent([{ role: "user", content: "My email is jordan@example.test." }]), false);
  assert.equal(
    hasExplicitContactConsent([
      { role: "assistant", content: "Do you consent to agency follow-up?" },
      { role: "user", content: "No." },
    ]),
    false,
  );
});

test("property viewing enquiry submits user-provided contact with explicit consent", () => {
  const message = "I would like to request a viewing or agent follow-up about property 7a2df33b-1fac-4dd5-9fe5-46021afea812. My contact information is visitor@example.test. I consent to Taurine contacting me about this enquiry.";
  const messages = [{ role: "user", content: message }];
  assert.equal(hasExplicitContactConsent(messages), true);
  assert.equal(wasContactProvidedByUser("email", "visitor@example.test", messages), true);
  assert.equal(requestedAction(messages), "viewing");
});

test("waitlist requires separate explicit property-update consent", () => {
  const messages = [
    { role: "assistant", content: "Would you like to save your preferences and receive matching property updates?" },
    { role: "user", content: "Yes, I agree. Please add me to the waitlist and keep me updated." },
  ];
  assert.equal(hasExplicitUpdatesConsent(messages), true);
  assert.equal(hasExplicitContactConsent(messages), false);
  assert.equal(hasExplicitContactConsent([
    ...messages,
    { role: "assistant", content: "May Taurine contact you about your request?" },
    { role: "user", content: "Yes, I consent to agency follow-up." },
  ]), true);
});

test("assistant provider failures and malformed tool calls are handled explicitly", () => {
  assert.equal(
    parseProviderToolCalls([
      { id: "call_1", type: "function", function: { name: "search_properties", arguments: "{}" } },
    ])[0].function.name,
    "search_properties",
  );
  assert.equal(
    parseProviderToolCalls([
      { id: "call_1", type: "function", function: { name: "create_lead", arguments: "{" } },
    ])[0].function.arguments,
    "{",
  );
  assert.equal(parseProviderToolCalls([{ id: "broken", type: "function" }]), null);
  assert.equal(providerErrorResponse(429).code, "AI_RATE_LIMITED");
  assert.equal(providerErrorResponse(500).code, "AI_PROVIDER_ERROR");
});

test("admin access requires trusted agency app metadata and scoped delete permission", () => {
  assert.equal(hasAgencyAdminClaim({ agency_role: "admin" }), true);
  assert.equal(hasAgencyAdminClaim({ agency_role: "staff" }), false);
  assert.equal(hasAgencyAdminClaim({ agency_role: "admin" }, "leads:delete"), false);
  assert.equal(
    hasAgencyAdminClaim(
      { agency_role: "admin", agency_permissions: ["leads:delete"] },
      "leads:delete",
    ),
    true,
  );
  assert.equal(hasAgencyAdminClaim(null), false);
});
