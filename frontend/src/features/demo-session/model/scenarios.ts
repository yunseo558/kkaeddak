import { z } from "zod";

export const scenarioIdSchema = z.enum([
  "regular-class",
  "exam-morning",
  "tired-interview",
]);

export type ScenarioId = z.infer<typeof scenarioIdSchema>;

export const scenarios: ReadonlyArray<{
  id: ScenarioId;
  name: string;
  summary: string;
  detail: string;
}> = [
  {
    id: "regular-class",
    name: "일반 수업",
    summary: "정상 수면과 최근 첫 알람 성공",
    detail: "낮은 단계의 계획과 해제되는 예비 알람을 확인합니다.",
  },
  {
    id: "exam-morning",
    name: "오전 시험",
    summary: "짧은 수면과 최근 첫 알람 실패",
    detail: "25분의 준비시간 전환과 최종 안전 알람을 확인합니다.",
  },
  {
    id: "tired-interview",
    name: "피로한 면접날",
    summary: "활동량 증가와 낮은 자기평가",
    detail: "승인 필요 상태와 강화된 기상 확인을 확인합니다.",
  },
] as const;

export function getScenario(scenarioId: ScenarioId) {
  return scenarios.find((scenario) => scenario.id === scenarioId);
}
