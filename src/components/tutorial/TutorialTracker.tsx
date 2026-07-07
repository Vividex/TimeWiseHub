"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

import { useTutorial } from "./TutorialProvider";

export default function TutorialTracker() {
  const router = useRouter();
  const {
    phase,
    currentStep,
    stepIndex,
    totalSteps,
    context,
    skipStep,
    skipTutorial,
  } = useTutorial();
  const [collapsed, setCollapsed] = useState(false);

  if (phase !== "steps" || !currentStep) {
    return null;
  }

  const handleSkipTutorial = () => {
    if (
      window.confirm(
        "Skip the tutorial? You can restart it anytime from Settings."
      )
    ) {
      skipTutorial();
    }
  };

  return (
    <div className="fixed bottom-5 left-5 z-50 w-80 max-w-[calc(100vw-2.5rem)] rounded-2xl border border-gray-100 bg-white p-4 shadow-sm dark:border-slate-800 dark:bg-slate-900">
      <div className="flex items-start justify-between gap-3">
        <div>
          <p className="text-xs font-medium uppercase text-gray-500 dark:text-slate-400">
            Step {stepIndex + 1} of {totalSteps}
          </p>
          {!collapsed && (
            <h2 className="mt-1 text-base font-semibold text-gray-950 dark:text-white">
              {currentStep.title}
            </h2>
          )}
        </div>
        <button
          type="button"
          onClick={() => setCollapsed((value) => !value)}
          className="rounded-full px-2 py-1 text-sm font-semibold text-gray-500 transition hover:bg-gray-100 hover:text-gray-900 dark:text-slate-400 dark:hover:bg-slate-800 dark:hover:text-white"
          aria-label={collapsed ? "Expand tutorial step" : "Collapse tutorial step"}
        >
          {collapsed ? "^" : "v"}
        </button>
      </div>

      {!collapsed && (
        <div className="mt-4 space-y-4">
          <p className="text-sm leading-6 text-gray-600 dark:text-slate-300">
            {currentStep.instructions}
          </p>

          <div className="flex flex-col items-stretch gap-2">
            <button
              type="button"
              onClick={() => router.push(currentStep.target(context))}
              className="rounded-lg bg-gray-950 px-4 py-2 text-sm font-semibold text-white transition hover:bg-gray-800 dark:bg-white dark:text-slate-950 dark:hover:bg-slate-200"
            >
              Take me there
            </button>
            <button
              type="button"
              onClick={skipStep}
              className="px-4 py-2 text-sm font-medium text-gray-600 transition hover:text-gray-950 dark:text-slate-300 dark:hover:text-white"
            >
              Skip this step
            </button>
            <button
              type="button"
              onClick={handleSkipTutorial}
              className="px-4 py-2 text-sm font-medium text-gray-500 transition hover:text-gray-950 dark:text-slate-400 dark:hover:text-white"
            >
              Skip tutorial
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
