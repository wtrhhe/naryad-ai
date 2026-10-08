import { createHmac } from "node:crypto";
import { z } from "zod";

export const personnelNumberSchema = z
  .string()
  .trim()
  .regex(/^[0-9]{3,10}$/, "personnel_number_format");

export const pinSchema = z
  .string()
  .trim()
  .regex(/^[0-9]{4,6}$/, "pin_format");

export function personnelEmail(personnelNumber: string, domain: string): string {
  return `${personnelNumberSchema.parse(personnelNumber)}@${domain}`;
}

export function derivePinPassword(personnelNumber: string, pin: string, pepper: string): string {
  if (pepper.length < 32) {
    throw new Error("AUTH_PIN_PEPPER must be at least 32 characters");
  }
  const number = personnelNumberSchema.parse(personnelNumber);
  const code = pinSchema.parse(pin);
  return createHmac("sha256", pepper).update(`${number}:${code}`).digest("base64url");
}
