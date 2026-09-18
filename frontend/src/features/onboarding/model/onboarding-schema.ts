import { z } from "zod";

export const onboardingSchema = z.object({
  usualWakeTime: z
    .string()
    .regex(/^([01]\d|2[0-3]):[0-5]\d$/, "기상 시각을 확인해 주세요."),
  recentFirstAlarmSucceeded: z.boolean(),
  washMinutes: z.number().int().min(0).max(180),
  breakfastMinutes: z.number().int().min(0).max(180),
  bagMinutes: z.number().int().min(0).max(180),
  preferredAlarmCount: z.number().int().min(1).max(3),
  keepSafetyAlarm: z.boolean(),
  automationMode: z.enum(["suggest", "automatic"]),
  outcomeSync: z.boolean(),
});

export type OnboardingValues = z.infer<typeof onboardingSchema>;
