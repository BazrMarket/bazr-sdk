/**
 * Wire-format schemas for the BAZR API.
 *
 * `docs/api-contract.md` is the source of truth; every shape below mirrors it.
 * That contract lives in the main repository:
 * https://github.com/BazrMarket/bazr/blob/main/docs/api-contract.md
 * Types are inferred from the schemas, never hand-written, so a schema edit and
 * a type edit cannot drift apart.
 */

import { z } from "zod";

/* -------------------------------------------------------------------------- */
/* primitives                                                                  */
/* -------------------------------------------------------------------------- */

/**
 * Integer amounts cross the wire as strings (lamport scale overflows float64).
 * Numbers are accepted and normalised to string rather than rejected, because
 * silently losing precision is worse than a boring coercion.
 */
const amount = z
  .union([z.string(), z.number()])
  .transform((v) => (typeof v === "number" ? String(v) : v));

const isoTimestamp = z.string();
const nullableTimestamp = z
  .string()
  .nullish()
  .transform((v) => v ?? null);
const nullableText = z
  .string()
  .nullish()
  .transform((v) => v ?? null);
