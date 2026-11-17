/** Staff roles in the working app. Parents use WhatsApp, not a login. */
export const STAFF_ROLES = ["owner", "principal", "accountant", "teacher"] as const;
export type StaffRole = (typeof STAFF_ROLES)[number];

export const ROLE_LABEL: Record<StaffRole, string> = {
  owner: "Owner",
  principal: "Principal",
  accountant: "Fee clerk",
  teacher: "Teacher",
};

export type Action =
  | "school.setup" // classes, fee heads, fee structures, settings
  | "team.manage" // invite / remove staff logins
  | "students.edit"
  | "students.import"
  | "students.view"
  | "fees.run" // generate monthly invoices
  | "fees.collect" // record payments, print receipts
  | "fees.reverse" // reverse a payment
  | "fees.discount.approve"
  | "fees.discount.request"
  | "fees.view"
  | "attendance.mark" // own sections only for teachers
  | "attendance.mark.any"
  | "attendance.view"
  | "staff.edit"
  | "messages.send"
  | "dashboard.owner";

const MATRIX: Record<StaffRole, Action[]> = {
  owner: [
    "school.setup", "team.manage", "students.edit", "students.import", "students.view", "fees.run", "fees.collect",
    "fees.reverse", "fees.discount.approve", "fees.discount.request", "fees.view", "attendance.mark.any", "attendance.mark",
    "attendance.view", "staff.edit", "messages.send", "dashboard.owner",
  ],
  principal: [
    "students.edit", "students.import", "students.view", "fees.view", "fees.discount.request", "attendance.mark.any",
    "attendance.mark", "attendance.view", "staff.edit", "messages.send",
  ],
  accountant: ["students.view", "fees.run", "fees.collect", "fees.view", "fees.discount.request", "messages.send"],
  teacher: ["attendance.mark", "students.view"],
};

export function can(role: StaffRole | string, action: Action): boolean {
  return (MATRIX as Record<string, Action[]>)[role]?.includes(action) ?? false;
}

export function isStaffRole(r: string): r is StaffRole {
  return (STAFF_ROLES as readonly string[]).includes(r);
}
