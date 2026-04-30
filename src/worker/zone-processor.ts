/**
 * ZoneProcessor Durable Object.
 *
 * Manages a single game zone, providing health status and (eventually)
 * zone-specific game logic such as NPC ticks, environment updates, etc.
 *
 * @module
 */

import { DurableObject } from "cloudflare:workers";

/**
 * A Durable Object that manages a single game zone, providing health status and (eventually)
 * zone-specific game logic such as NPC ticks, environment updates, etc.
 */
export class ZoneProcessor extends DurableObject<Env> {
  constructor(ctx: DurableObjectState, env: Env) {
    super(ctx, env);
  }

  /** Returns a lightweight health-check payload. */
  async getHealth() {
    return { status: "ok", timestamp: new Date().toISOString() };
  }
}
