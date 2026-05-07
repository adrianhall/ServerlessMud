/** Constants for the first playable zone. */
export const ACTIVE_ZONE_ID = 30;
export const ACTIVE_ZONE_DO_NAME = zoneProcessorName(ACTIVE_ZONE_ID);
export const START_ROOM_VNUM = 3001;

export function zoneProcessorName(zoneId: number): string {
  return `zone-${zoneId}`;
}
