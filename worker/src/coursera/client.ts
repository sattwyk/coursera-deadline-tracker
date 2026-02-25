type BuildRequestInput = {
  courseraUserId: number;
  degreeId: string;
  csrf3Token: string;
  cookieHeader: string;
};

type BuiltRequest = {
  url: string;
  init: RequestInit & { headers: Record<string, string> };
};

export function buildCalendarRequest(input: BuildRequestInput): BuiltRequest {
  const url =
    "https://www.coursera.org/api/grpc/degreehome/v1beta1/DegreeHomeCalendarAPI/GetDegreeHomeCalendar";
  return {
    url,
    init: {
      method: "POST",
      headers: {
        accept: "application/json",
        "content-type": "application/json",
        "operation-name": "GetDegreeHomeCalendar",
        origin: "https://www.coursera.org",
        referer: "https://www.coursera.org/",
        "x-csrf3-token": input.csrf3Token,
        cookie: input.cookieHeader,
      },
      body: JSON.stringify({
        userId: input.courseraUserId,
        degreeId: input.degreeId,
      }),
    },
  };
}

export function buildCookieHeader(
  cookies: Array<{
    name: string;
    value: string;
  }>,
): string {
  return cookies.map((cookie) => `${cookie.name}=${cookie.value}`).join("; ");
}
