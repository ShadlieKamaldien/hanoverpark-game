import type { MissionStatus } from "../config/constants";
import { MAP } from "../world/mapData";
export const DESTINATION = { ...MAP.locations.target, label: `${MAP.locations.target.name} · delivery point` };
export class DeliveryMission {
  status: MissionStatus = "available";
  accept() {
    if (this.status === "available") this.status = "active";
  }
  complete() {
    if (this.status !== "active") return 0;
    this.status = "complete";
    return 150;
  }
  get objective() {
    return this.status === "available"
      ? "Meet Aunty Fatima at the corner shop"
      : this.status === "active"
        ? `Deliver groceries to ${DESTINATION.name} · press E at the marker`
        : "Delivery complete! Explore the neighbourhood";
  }
}
