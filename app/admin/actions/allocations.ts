"use server";

import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/db";
import { parseAllocationLines, validateAllocationPercentages } from "@/lib/domain/admin";
import { go } from "./helpers";

export async function updateContractAllocations(formData: FormData) {
  try {
    const contractId = String(formData.get("contractId") ?? "");
    const profileIds = formData.getAll("profileId").map(String);
    const allocationLines = parseAllocationLines(formData, profileIds);
    validateAllocationPercentages(allocationLines);

    await prisma.$transaction(
      allocationLines.map((line) =>
        prisma.contractAllocationTemplate.upsert({
          where: {
            contractId_profileCategoryId: {
              contractId,
              profileCategoryId: line.profileCategoryId,
            },
          },
          create: {
            contractId,
            profileCategoryId: line.profileCategoryId,
            targetPercentage: line.targetPercentage,
          },
          update: {
            targetPercentage: line.targetPercentage,
          },
        }),
      ),
    );
  } catch (error) {
    return go(error instanceof Error ? error.message : "Verdeelsleutel bijwerken is mislukt.", "error");
  }
  revalidatePath("/admin");
  return go("Verdeelsleutel bijgewerkt.");
}
