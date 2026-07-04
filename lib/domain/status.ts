/**
 * Centrale workflow-statussen voor Simulation.status en ProjectPlan.status.
 *
 * Beide modellen doorlopen dezelfde workflow: een voorstel start als
 * "concept" en wordt daarna "approved" (een ProjectPlan kan daarnaast ook
 * "rejected" worden). Gebruik altijd deze constanten in plaats van losse
 * strings, zodat de termen overal consistent blijven.
 *
 * Let op: DeliveryReport.aiDraftStatus en Contract.aiInsightsStatus zijn een
 * ándere workflow (AI-conceptteksten) en vallen hier bewust buiten.
 */
export const WORKFLOW_STATUS = {
  concept: "concept",
  approved: "approved",
  rejected: "rejected",
} as const;

export type WorkflowStatus = (typeof WORKFLOW_STATUS)[keyof typeof WORKFLOW_STATUS];
