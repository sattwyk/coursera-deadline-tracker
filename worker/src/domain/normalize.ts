export type NormalizedItem = {
  kind: "assignment" | "event";
  stableKey: string;
  courseId: string;
  courseName: string;
  title: string;
  deadlineAt: string;
  url: string;
  isComplete: boolean;
  rawJson: string;
};

type CalendarAssignment = {
  itemId: string;
  courseId: string;
  courseName: string;
  assignmentName: string;
  dueAtTime: string;
  assignmentUrl: string;
  isComplete?: boolean;
};

type CalendarEvent = {
  eventId: string;
  courseId: string;
  courseName: string;
  eventTitle: string;
  startTime: string;
  eventUrl: string;
};

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

function isCalendarAssignment(value: unknown): value is CalendarAssignment {
  if (!isRecord(value)) return false;
  return (
    typeof value.itemId === "string" &&
    typeof value.courseId === "string" &&
    typeof value.courseName === "string" &&
    typeof value.assignmentName === "string" &&
    typeof value.dueAtTime === "string" &&
    typeof value.assignmentUrl === "string"
  );
}

function isCalendarEvent(value: unknown): value is CalendarEvent {
  if (!isRecord(value)) return false;
  return (
    typeof value.eventId === "string" &&
    typeof value.courseId === "string" &&
    typeof value.courseName === "string" &&
    typeof value.eventTitle === "string" &&
    typeof value.startTime === "string" &&
    typeof value.eventUrl === "string"
  );
}

export function normalizeCalendarItems(items: unknown[]): NormalizedItem[] {
  return items.flatMap<NormalizedItem>((entry): NormalizedItem[] => {
    if (!isRecord(entry)) return [];
    if (isCalendarAssignment(entry.assignment)) {
      const a = entry.assignment;
      return [
        {
          kind: "assignment",
          stableKey: `assignment:${a.itemId}`,
          courseId: a.courseId,
          courseName: a.courseName,
          title: a.assignmentName,
          deadlineAt: a.dueAtTime,
          url: a.assignmentUrl,
          isComplete: Boolean(a.isComplete),
          rawJson: JSON.stringify(entry),
        },
      ];
    }

    if (isCalendarEvent(entry.event)) {
      const e = entry.event;
      return [
        {
          kind: "event",
          stableKey: `event:${e.eventId}`,
          courseId: e.courseId,
          courseName: e.courseName,
          title: e.eventTitle,
          deadlineAt: e.startTime,
          url: e.eventUrl,
          isComplete: false,
          rawJson: JSON.stringify(entry),
        },
      ];
    }

    return [];
  });
}
