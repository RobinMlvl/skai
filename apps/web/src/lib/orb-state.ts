import type { Phase } from "@skai/core";
import type { OrbState } from "thinking-orbs";

const ORB_BY_PHASE: Record<Phase, OrbState> = {
  queued: "breathing",
  connecting: "connecting",
  sweeping: "working",
  rescuing: "searching",
  analyzing: "solving",
  judging: "composing",
  finished: "breathing",
};

export const orbState = (phase: Phase | null): OrbState => (phase ? ORB_BY_PHASE[phase] : "breathing");
