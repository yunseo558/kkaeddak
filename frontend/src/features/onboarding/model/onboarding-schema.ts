import { z } from "zod";

export const onboardingSchema = z.object({
  recentFirstAlarmSucceeded: z.boolean(),
  preferredAlarmCount: z.number().int().min(1).max(3),
  keepSafetyAlarm: z.boolean(),
  automationMode: z.enum(["suggest", "automatic"]),
  outcomeSync: z.boolean(),
});

export type OnboardingValues = z.infer<typeof onboardingSchema>;
