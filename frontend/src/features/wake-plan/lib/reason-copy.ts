export const reasonCopy: Record<string, string> = {
  SHORTER_SLEEP_THAN_BASELINE: "평소보다 수면시간이 짧았습니다",
  LATER_BEDTIME_THAN_BASELINE: "평소보다 늦게 잠들었습니다",
  HIGH_ACTIVITY_DEVIATION: "평소보다 활동량이 많았습니다",
  RECENT_FIRST_ALARM_FAILURE:
    "비슷한 날 첫 알람만으로 일어나지 못했습니다",
  IMPORTANT_EVENT: "놓치면 안 되는 일정으로 설정했습니다",
  LOW_MODEL_CONFIDENCE: "비슷한 기록이 부족해 확인이 필요합니다",
  PREP_TASKS_COMPLETED: "전날 준비를 완료해 기상시각을 늦췄습니다",
};

export function getVisibleReasons(reasonCodes: readonly string[]) {
  return reasonCodes
    .map((code) => reasonCopy[code])
    .filter((copy): copy is string => Boolean(copy))
    .slice(0, 3);
}
