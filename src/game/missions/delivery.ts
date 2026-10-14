import type { MissionStatus } from "../config/constants";
export const DESTINATION = { x: 1780, y: 510, label: "Block C · front door" };
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
        ? "Deliver groceries to Block C · press E at the door"
        : "Delivery complete! Explore the neighbourhood";
  }
}
