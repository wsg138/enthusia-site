import { json, methodNotAllowed, serviceUnavailable } from "../../../lib/responses.js";
import { signedStaffGet, staffApiResponse } from "../../../lib/staff-api.js";

const CASES_PATH = "/v1/public/cases";
const CASE_ID_PATTERN = /^[A-Za-z0-9_-]{1,64}$/;

export function isValidCaseId(id) {
  return typeof id === "string" && CASE_ID_PATTERN.test(id);
}

export function buildCaseTarget(id) {
  return `${CASES_PATH}/${id}`;
}

export async function onRequestGet(context) {
  const id = context.params && context.params.id;

  if (!isValidCaseId(id)) {
    return json({ ok: false, error: "invalid_case_id" }, 400);
  }

  try {
    const upstream = await signedStaffGet(context.env, buildCaseTarget(id));
    return staffApiResponse(upstream, "public, max-age=60");
  } catch {
    return serviceUnavailable();
  }
}

export function onRequest() {
  return methodNotAllowed(["GET"]);
}
