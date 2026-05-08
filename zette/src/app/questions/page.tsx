import { notFound } from "next/navigation";

import { QuestionView } from "@/components/question-view";
import { readQuestionsDataset } from "@/lib/questions-data";

export const dynamic = "force-dynamic";

type QuestionsPageProps = {
  searchParams: Promise<{ q?: string }>;
};

function pickRandomQuestionIndex(length: number) {
  return Math.floor(Math.random() * length);
}

export default async function QuestionsPage({ searchParams }: QuestionsPageProps) {
  const params = await searchParams;
  const dataset = await readQuestionsDataset();
  const { questions } = dataset;

  if (questions.length === 0) {
    notFound();
  }

  const requested = params.q
    ? questions.find((question) => question.id === params.q) ?? null
    : null;
  const current = requested ?? questions[pickRandomQuestionIndex(questions.length)];

  return <QuestionView question={current} total={questions.length} />;
}
