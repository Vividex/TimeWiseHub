"use client";

import { useTutorial } from "./TutorialProvider";

export default function TutorialComplete() {
  const { phase, skipTutorial } = useTutorial();

  if (phase !== "complete") {
    return null;
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 px-4">
      <div className="w-full max-w-md rounded-2xl bg-white p-8 text-center shadow-2xl dark:bg-slate-900">
        <h2 className="text-2xl font-semibold text-gray-950 dark:text-white">
          Nice — you're all set!
        </h2>
        <p className="mt-3 text-sm leading-6 text-gray-600 dark:text-slate-300">
          You've walked through the essentials — you're ready to go.
        </p>
        <button
          type="button"
          onClick={skipTutorial}
          className="mt-6 rounded-lg bg-gray-950 px-5 py-2.5 text-sm font-semibold text-white transition hover:bg-gray-800 dark:bg-white dark:text-slate-950 dark:hover:bg-slate-200"
        >
          Done
        </button>
      </div>
    </div>
  );
}
