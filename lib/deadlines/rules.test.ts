import { describe, expect, it } from "vitest";
import { pickReplacement, planDeadlineNotifications } from "@/lib/deadlines/rules";
import {
  DEFAULT_DEADLINE_SETTINGS,
  type DeadlineOrder,
  type ReplacementCandidate,
} from "@/lib/deadlines/types";

const now = new Date("2026-10-16T10:05:00+05:00");

function order(overrides: Partial<DeadlineOrder> = {}): DeadlineOrder {
  return {
    id: "order-147",
    number: 147,
    status: "in_progress",
    priority: "normal",
    issuedAt: "2026-10-16T08:00:00+05:00",
    statusSince: "2026-10-16T09:20:00+05:00",
    dueAt: "2026-10-16T09:20:00+05:00",
    standardHours: null,
    assigneeId: "worker-1",
    assigneeName: "Ахметов Ерлан",
    assigneeSpecialty: "fitter",
    masterId: "master-1",
    equipmentName: "Дробилка КМД-1750",
    siteName: "Дробление",
    lastComment: "ждём подшипник со склада",
    ...overrides,
  };
}

const plan = (
  orders: DeadlineOrder[],
  settings = DEFAULT_DEADLINE_SETTINGS,
  candidates: ReplacementCandidate[] = [],
) => planDeadlineNotifications(orders, candidates, settings, now);

describe("overdue notifications", () => {
  it("notifies the worker and the master when the deadline passed", () => {
    const result = plan([order()]);
    expect(result.map((item) => [item.kind, item.recipient])).toEqual([
      ["overdue", { kind: "employee", employeeId: "worker-1" }],
      ["overdue", { kind: "employee", employeeId: "master-1" }],
    ]);
    expect(result[0]?.overdueMinutes).toBe(45);
  });

  it("repeats once per interval through the dedupe key", () => {
    const [first] = plan([order()]);
    const [later] = planDeadlineNotifications(
      [order()],
      [],
      DEFAULT_DEADLINE_SETTINGS,
      new Date(now.getTime() + 15 * 60_000),
    );
    expect(first?.dedupeKey).toBe("overdue:order-147:worker-1:3");
    expect(later?.dedupeKey).toBe("overdue:order-147:worker-1:4");
  });

  it("escalates to managers after a long delay", () => {
    const result = plan([order({ dueAt: "2026-10-16T07:00:00+05:00" })]);
    expect(result.filter((item) => item.kind === "manager_overdue")).toHaveLength(1);
  });

  it("does not chase closed, done or rejected orders", () => {
    expect(
      plan([order({ status: "done" }), order({ status: "closed" }), order({ status: "rejected" })]),
    ).toEqual([]);
  });

  it("uses the standard hours when there is no explicit deadline", () => {
    const result = plan([
      order({ dueAt: null, standardHours: 1, issuedAt: "2026-10-16T08:50:00+05:00" }),
    ]);
    expect(result[0]?.overdueMinutes).toBe(15);
  });
});

describe("reminders", () => {
  it("reminds the worker once inside the reminder window", () => {
    const result = plan([order({ dueAt: "2026-10-16T10:25:00+05:00" })]);
    expect(result).toEqual([
      expect.objectContaining({
        kind: "deadline_reminder",
        minutesLeft: 20,
        dedupeKey: "deadline_reminder:order-147",
      }),
    ]);
  });

  it("stays silent when the deadline is far away", () => {
    expect(plan([order({ dueAt: "2026-10-16T12:00:00+05:00" })])).toEqual([]);
  });
});

describe("acceptance escalation", () => {
  const issued = order({
    status: "issued",
    dueAt: "2026-10-16T18:00:00+05:00",
    issuedAt: "2026-10-16T09:54:00+05:00",
  });
  const candidates: ReplacementCandidate[] = [
    {
      employeeId: "worker-1",
      fullName: "Ахметов Ерлан",
      specialty: "fitter",
      onShift: true,
      busy: false,
    },
    {
      employeeId: "worker-2",
      fullName: "Иванов Пётр",
      specialty: "electrician",
      onShift: true,
      busy: false,
    },
    {
      employeeId: "worker-3",
      fullName: "Сейтов Алмас",
      specialty: "fitter",
      onShift: true,
      busy: false,
    },
  ];

  it("escalates a normal order not accepted for 10 minutes and proposes a free colleague", () => {
    const [escalation] = plan([issued], DEFAULT_DEADLINE_SETTINGS, candidates);
    expect(escalation).toMatchObject({
      kind: "accept_escalation",
      recipient: { kind: "employee", employeeId: "master-1" },
      waitingMinutes: 11,
    });
    expect(escalation?.replacement?.employeeId).toBe("worker-3");
  });

  it("escalates an emergency after 3 minutes", () => {
    const emergency = {
      ...issued,
      priority: "emergency" as const,
      issuedAt: "2026-10-16T10:01:30+05:00",
    };
    expect(plan([emergency])).toEqual([
      expect.objectContaining({ kind: "accept_escalation", urgent: true }),
    ]);
  });

  it("does not escalate a normal order after 3 minutes", () => {
    expect(plan([{ ...issued, issuedAt: "2026-10-16T10:01:30+05:00" }])).toEqual([]);
  });

  it("treats a queued order as answered", () => {
    expect(plan([{ ...issued, status: "queued" }])).toEqual([]);
  });
});

describe("demo time acceleration", () => {
  it("shrinks every threshold by the time scale", () => {
    const quick = order({
      status: "issued",
      dueAt: "2026-10-16T18:00:00+05:00",
      issuedAt: "2026-10-16T10:04:00+05:00",
    });
    const result = plan([quick], { ...DEFAULT_DEADLINE_SETTINGS, timeScale: 20 });
    expect(result).toEqual([
      expect.objectContaining({ kind: "accept_escalation", waitingMinutes: 20 }),
    ]);
  });
});

describe("pickReplacement", () => {
  it("returns null when nobody is free", () => {
    const busy: ReplacementCandidate[] = [
      {
        employeeId: "worker-9",
        fullName: "Занятой",
        specialty: "fitter",
        onShift: true,
        busy: true,
      },
      {
        employeeId: "worker-8",
        fullName: "Дома",
        specialty: "fitter",
        onShift: false,
        busy: false,
      },
    ];
    expect(pickReplacement(order(), busy)).toBeNull();
  });
});
