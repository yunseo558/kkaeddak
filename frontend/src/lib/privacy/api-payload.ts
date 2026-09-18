const FORBIDDEN_FIELD_NAMES = new Set(
  [
    "accelerometer",
    "acceleration",
    "audio",
    "bedtime",
    "gyroscope",
    "healthKitData",
    "heartRate",
    "heartRateSeries",
    "heartRateVariability",
    "hrv",
    "latitude",
    "locationHistory",
    "longitude",
    "menstrualCycle",
    "menstrualRecords",
    "microphone",
    "movementSeries",
    "periodRecords",
    "personalModelParameters",
    "preciseLocation",
    "rawHealthData",
    "screenStateEvents",
    "screenUsage",
    "sensorEvents",
    "sleepDuration",
    "sleepHours",
    "sleepStages",
    "sleepTimeSeries",
    "stepCount",
    "stepSeries",
    "symptomRecords",
    "wakeDifficultyScore",
  ].map(normalizeFieldName),
);

const FORBIDDEN_FIELD_PREFIXES = [
  "rawhealth",
  "rawsensor",
  "sleep",
  "heartrate",
  "hrv",
  "menstrual",
  "menstruation",
  "period",
  "symptom",
  "accelerometer",
  "acceleration",
  "gyroscope",
  "microphone",
  "audio",
  "movement",
  "stepcount",
  "stepseries",
  "screenusage",
  "screenstate",
  "sensorevent",
  "latitude",
  "longitude",
  "gps",
  "wakedifficulty",
  "personalmodel",
] as const;

function normalizeFieldName(fieldName: string) {
  return fieldName.replace(/[^a-zA-Z0-9]/g, "").toLowerCase();
}

function isForbiddenField(fieldName: string) {
  const normalized = normalizeFieldName(fieldName);
  return (
    FORBIDDEN_FIELD_NAMES.has(normalized) ||
    FORBIDDEN_FIELD_PREFIXES.some((prefix) => normalized.startsWith(prefix))
  );
}

export function findForbiddenApiFields(
  value: unknown,
  path = "$",
): Array<string> {
  if (Array.isArray(value)) {
    return value.flatMap((item, index) =>
      findForbiddenApiFields(item, `${path}[${index}]`),
    );
  }

  if (value === null || typeof value !== "object") {
    return [];
  }

  return Object.entries(value).flatMap(([key, child]) => {
    const childPath = `${path}.${key}`;
    const current = isForbiddenField(key) ? [childPath] : [];
    return [...current, ...findForbiddenApiFields(child, childPath)];
  });
}

export function assertSafeApiPayload(value: unknown): void {
  const forbiddenFields = findForbiddenApiFields(value);
  if (forbiddenFields.length > 0) {
    throw new Error(
      `Privacy-protected fields cannot be sent to the API: ${forbiddenFields.join(", ")}`,
    );
  }
}

export function pickAllowedApiPayload<
  Source extends Record<string, unknown>,
  Key extends keyof Source,
>(source: Source, allowedKeys: readonly Key[]): Pick<Source, Key> {
  const payload = Object.fromEntries(
    allowedKeys.map((key) => [key, source[key]]),
  ) as Pick<Source, Key>;

  assertSafeApiPayload(payload);
  return payload;
}
