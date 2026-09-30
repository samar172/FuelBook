export type OnboardingStep = {
  id: string;
  title: string;
  titleKey?: string;
  status: "DONE" | "TODO" | "ATTENTION";
  detail: string;
  detailKey?: string | null;
  detailVars?: Record<string, string | number> | null;
  href: string;
  required: boolean;
  why: string;
  whyKey?: string;
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
