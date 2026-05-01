/**
 * Shared path-policy evaluation used by both middleware functions.
 *
 * @module
 */

import type { PathPolicy } from "./types";

/**
 * Evaluate a request pathname against an ordered list of policies.
 *
 * Returns the `authenticate` value of the **first matching** policy, or
 * `undefined` when no policy matches (the caller decides what to do in
 * that case).
 */
export function matchPolicy(pathname: string, policies: PathPolicy[]): boolean | undefined {
  for (const { pattern, authenticate } of policies) {
    if (pattern.test(pathname)) {
      return authenticate;
    }
  }
  return undefined;
}
