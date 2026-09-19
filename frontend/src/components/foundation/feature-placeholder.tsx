import Link from "next/link";

import { AppShell } from "@/components/layout/app-shell";

type DemoStep = "소개" | "분석" | "준비" | "계획" | "결과";

type FeaturePlaceholderProps = {
  title: string;
  description: string;
  step: DemoStep;
};

export function FeaturePlaceholder({
  title,
  description,
  step,
}: FeaturePlaceholderProps) {
  return (
    <AppShell currentStep={step} eyebrow="기술 기반 준비 완료">
      <section className="rounded-[var(--radius-card)] border border-border bg-surface p-6 sm:p-8">
        <h1 className="text-3xl font-bold tracking-tight">{title}</h1>
        <p className="mt-4 max-w-2xl leading-7 text-muted">{description}</p>
        <Link
          className="mt-8 inline-flex min-h-11 items-center rounded-[var(--radius-control)] bg-brand px-5 font-semibold text-white"
          href="/"
        >
          처음으로 돌아가기
        </Link>
      </section>
    </AppShell>
  );
}
