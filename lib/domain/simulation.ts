import { roundOne } from "./calculations";

export type AllocationInput = {
  profileCategoryId: string;
  profileName: string;
  targetPercentage: number;
};

export type SimulationProposalLine = AllocationInput & {
  proposedHours: number;
  finalHours: number;
};

export function normalizePercentages(lines: AllocationInput[]) {
  const total = lines.reduce((sum, line) => sum + line.targetPercentage, 0);

  if (total <= 0) {
    return lines.map((line) => ({ ...line, targetPercentage: 0 }));
  }

  return lines.map((line) => ({
    ...line,
    targetPercentage: (line.targetPercentage / total) * 100,
  }));
}

export function createSimulationProposal(
  totalHours: number,
  allocationLines: AllocationInput[],
): SimulationProposalLine[] {
  const normalized = normalizePercentages(allocationLines);
  let runningTotal = 0;

  const proposed = normalized.map((line, index) => {
    const isLast = index === normalized.length - 1;
    const proposedHours = isLast
      ? roundOne(totalHours - runningTotal)
      : roundOne((totalHours * line.targetPercentage) / 100);
    runningTotal = roundOne(runningTotal + proposedHours);

    return {
      ...line,
      targetPercentage: Math.round(line.targetPercentage * 100) / 100,
      proposedHours,
      finalHours: proposedHours,
    };
  });

  const correction = roundOne(totalHours - proposed.reduce((sum, line) => sum + line.finalHours, 0));
  if (proposed.length > 0 && correction !== 0) {
    const last = proposed[proposed.length - 1];
    last.proposedHours = roundOne(last.proposedHours + correction);
    last.finalHours = last.proposedHours;
  }

  return proposed;
}
