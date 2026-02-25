export function extractDegreeTargets(
  _items: unknown[],
  fallbackDegreeId: string,
  courseraUserId: number,
) {
  return [{ courseraUserId, degreeId: fallbackDegreeId }];
}
