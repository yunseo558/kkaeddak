import { z } from "zod";

const timePattern = /^([01]\d|2[0-3]):[0-5]\d$/;

export function createPlanEditSchema(deadlineTime: string) {
  return z
    .object({
      firstAlarmTime: z.string().regex(timePattern, "첫 알람 시각을 확인해 주세요."),
      finalAlarmTime: z.string().regex(timePattern, "최종 알람 시각을 확인해 주세요."),
    })
    .superRefine((values, context) => {
      if (values.firstAlarmTime > values.finalAlarmTime) {
        context.addIssue({
          code: "custom",
          path: ["firstAlarmTime"],
          message: "첫 알람은 최종 알람보다 늦을 수 없습니다.",
        });
      }
      if (values.finalAlarmTime > deadlineTime) {
        context.addIssue({
          code: "custom",
          path: ["finalAlarmTime"],
          message: "최종 알람은 기상 마감보다 늦을 수 없습니다.",
        });
      }
    });
}

export type PlanEditValues = z.infer<ReturnType<typeof createPlanEditSchema>>;

export function koreanLocalTimeToUtc(localDate: string, time: string) {
  return new Date(`${localDate}T${time}:00+09:00`).toISOString();
}
