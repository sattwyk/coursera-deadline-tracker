type Lite = { stableKey: string; deadlineAt: string; isComplete: boolean };

type DiffEvent = {
  type: "new" | "changed" | "removed";
  stableKey: string;
  oldDeadlineAt: string | null;
  newDeadlineAt: string | null;
};

export function computeDeadlineEvents(
  previous: Lite[],
  latest: Lite[],
  nowIso: string,
): DiffEvent[] {
  const now = Date.parse(nowIso);
  const filteredLatest = latest.filter(
    (item) => !item.isComplete && Date.parse(item.deadlineAt) > now,
  );

  const previousMap = new Map(previous.map((item) => [item.stableKey, item]));
  const latestMap = new Map(filteredLatest.map((item) => [item.stableKey, item]));

  const events: DiffEvent[] = [];

  for (const item of filteredLatest) {
    const prev = previousMap.get(item.stableKey);
    if (!prev) {
      events.push({
        type: "new",
        stableKey: item.stableKey,
        oldDeadlineAt: null,
        newDeadlineAt: item.deadlineAt,
      });
      continue;
    }
    if (prev.deadlineAt !== item.deadlineAt) {
      events.push({
        type: "changed",
        stableKey: item.stableKey,
        oldDeadlineAt: prev.deadlineAt,
        newDeadlineAt: item.deadlineAt,
      });
    }
  }

  for (const prev of previous) {
    if (!latestMap.has(prev.stableKey)) {
      events.push({
        type: "removed",
        stableKey: prev.stableKey,
        oldDeadlineAt: prev.deadlineAt,
        newDeadlineAt: null,
      });
    }
  }

  return events;
}
