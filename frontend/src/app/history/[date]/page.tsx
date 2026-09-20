import { ServiceHistoryDetail } from "@/features/service/components/service-history-detail";

export default async function HistoryReportPage({
  params,
}: {
  params: Promise<{ date: string }>;
}) {
  const { date } = await params;
  return <ServiceHistoryDetail date={date} />;
}
