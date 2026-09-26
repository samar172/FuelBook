export type OnboardingStep = {
  id: string;
  title: string;
  status: "DONE" | "TODO" | "ATTENTION";
  detail: string;
  href: string;
  required: boolean;
  why: string;
};

export type OnboardingResponse = {
  pump: {
    id: string;
    name: string;
    cashHandoverMode: "PER_ATTENDANT" | "POOLED_CASHIER";
  };
  steps: OnboardingStep[];
  progress: {
    requiredTotal: number;
    requiredDone: number;
    percent: number;
    allRequiredDone: boolean;
  };
  nextStepId: string | null;
  readyForFirstShift: boolean;
};
