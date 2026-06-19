"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { prisma } from "@/lib/db";
import {
  contractFormSchema,
  employeeFormSchema,
  parseAllocationLines,
  parseTaskNames,
  profileFormSchema,
  taskFormSchema,
  validateAllocationPercentages,
} from "@/lib/domain/admin";

function go(message: string, type: "success" | "error" = "success") {
  const key = type === "success" ? "adminMessage" : "adminError";
  redirect(`/admin?${key}=${encodeURIComponent(message)}`);
}

function activeFromForm(formData: FormData) {
  return formData.get("active") === "on";
}

export async function createProfile(formData: FormData) {
  try {
    const parsed = profileFormSchema.parse({
      name: formData.get("name"),
      defaultAllocationPercentage: formData.get("defaultAllocationPercentage"),
      active: true,
    });
    await prisma.profileCategory.create({ data: parsed });
  } catch (error) {
    return go(error instanceof Error ? error.message : "Profiel aanmaken is mislukt.", "error");
  }
  revalidatePath("/admin");
  return go("Profiel aangemaakt.");
}

export async function updateProfile(formData: FormData) {
  try {
    const parsed = profileFormSchema.parse({
      id: formData.get("id"),
      name: formData.get("name"),
      defaultAllocationPercentage: formData.get("defaultAllocationPercentage"),
      active: activeFromForm(formData),
    });
    await prisma.profileCategory.update({
      where: { id: parsed.id! },
      data: {
        name: parsed.name,
        defaultAllocationPercentage: parsed.defaultAllocationPercentage,
        active: parsed.active,
      },
    });
  } catch (error) {
    return go(error instanceof Error ? error.message : "Profiel bijwerken is mislukt.", "error");
  }
  revalidatePath("/admin");
  return go("Profiel bijgewerkt.");
}

export async function deactivateProfile(formData: FormData) {
  const id = String(formData.get("id") ?? "");
  await prisma.profileCategory.update({ where: { id }, data: { active: false } });
  revalidatePath("/admin");
  go("Profiel gedeactiveerd.");
}

export async function createEmployee(formData: FormData) {
  try {
    const parsed = employeeFormSchema.parse({
      name: formData.get("name"),
      profileCategoryId: formData.get("profileCategoryId"),
      active: true,
    });
    await prisma.employee.create({ data: parsed });
  } catch (error) {
    return go(error instanceof Error ? error.message : "Medewerker aanmaken is mislukt.", "error");
  }
  revalidatePath("/admin");
  return go("Medewerker aangemaakt.");
}

export async function updateEmployee(formData: FormData) {
  try {
    const parsed = employeeFormSchema.parse({
      id: formData.get("id"),
      name: formData.get("name"),
      profileCategoryId: formData.get("profileCategoryId"),
      active: activeFromForm(formData),
    });
    await prisma.employee.update({
      where: { id: parsed.id! },
      data: {
        name: parsed.name,
        profileCategoryId: parsed.profileCategoryId,
        active: parsed.active,
      },
    });
  } catch (error) {
    return go(error instanceof Error ? error.message : "Medewerker bijwerken is mislukt.", "error");
  }
  revalidatePath("/admin");
  return go("Medewerker bijgewerkt.");
}

export async function deactivateEmployee(formData: FormData) {
  const id = String(formData.get("id") ?? "");
  await prisma.employee.update({ where: { id }, data: { active: false } });
  revalidatePath("/admin");
  go("Medewerker gedeactiveerd.");
}

export async function createTask(formData: FormData) {
  try {
    const parsed = taskFormSchema.parse({
      contractId: formData.get("contractId"),
      name: formData.get("name"),
      active: true,
    });
    await prisma.task.create({ data: parsed });
  } catch (error) {
    return go(error instanceof Error ? error.message : "Taak aanmaken is mislukt.", "error");
  }
  revalidatePath("/admin");
  return go("Taak aangemaakt.");
}

export async function updateTask(formData: FormData) {
  try {
    const parsed = taskFormSchema.parse({
      id: formData.get("id"),
      contractId: formData.get("contractId"),
      name: formData.get("name"),
      active: activeFromForm(formData),
    });
    await prisma.task.update({
      where: { id: parsed.id! },
      data: {
        name: parsed.name,
        active: parsed.active,
      },
    });
  } catch (error) {
    return go(error instanceof Error ? error.message : "Taak bijwerken is mislukt.", "error");
  }
  revalidatePath("/admin");
  return go("Taak bijgewerkt.");
}

export async function deactivateTask(formData: FormData) {
  const id = String(formData.get("id") ?? "");
  await prisma.task.update({ where: { id }, data: { active: false } });
  revalidatePath("/admin");
  go("Taak gedeactiveerd.");
}

export async function createContractWithSetup(formData: FormData) {
  try {
    const parsed = contractFormSchema.parse({
      code: formData.get("code"),
      name: formData.get("name"),
      totalBudgetHours: formData.get("totalBudgetHours"),
      startDate: formData.get("startDate"),
      endDate: formData.get("endDate"),
      warningThreshold: formData.get("warningThreshold"),
      criticalThreshold: formData.get("criticalThreshold"),
      active: true,
    });
    const profileIds = formData.getAll("profileId").map(String);
    const allocationLines = parseAllocationLines(formData, profileIds);
    validateAllocationPercentages(allocationLines);
    const taskNames = parseTaskNames(formData.get("tasks"));

    await prisma.contract.create({
      data: {
        code: parsed.code,
        name: parsed.name,
        totalBudgetHours: parsed.totalBudgetHours,
        startDate: parsed.startDate,
        endDate: parsed.endDate,
        warningThreshold: parsed.warningThreshold,
        criticalThreshold: parsed.criticalThreshold,
        active: true,
        tasks: {
          create: taskNames.map((name) => ({ name })),
        },
        allocationTemplates: {
          create: allocationLines.map((line) => ({
            profileCategoryId: line.profileCategoryId,
            targetPercentage: line.targetPercentage,
          })),
        },
      },
    });
  } catch (error) {
    return go(error instanceof Error ? error.message : "Contract aanmaken is mislukt.", "error");
  }
  revalidatePath("/admin");
  return go("Contract met taken en verdeelsleutel aangemaakt.");
}

export async function updateContract(formData: FormData) {
  try {
    const parsed = contractFormSchema.parse({
      id: formData.get("id"),
      code: formData.get("code"),
      name: formData.get("name"),
      totalBudgetHours: formData.get("totalBudgetHours"),
      startDate: formData.get("startDate"),
      endDate: formData.get("endDate"),
      warningThreshold: formData.get("warningThreshold"),
      criticalThreshold: formData.get("criticalThreshold"),
      active: activeFromForm(formData),
    });

    await prisma.contract.update({
      where: { id: parsed.id! },
      data: {
        code: parsed.code,
        name: parsed.name,
        totalBudgetHours: parsed.totalBudgetHours,
        startDate: parsed.startDate,
        endDate: parsed.endDate,
        warningThreshold: parsed.warningThreshold,
        criticalThreshold: parsed.criticalThreshold,
        active: parsed.active,
      },
    });
  } catch (error) {
    return go(error instanceof Error ? error.message : "Contract bijwerken is mislukt.", "error");
  }
  revalidatePath("/admin");
  return go("Contract bijgewerkt.");
}

export async function deactivateContract(formData: FormData) {
  const id = String(formData.get("id") ?? "");
  await prisma.contract.update({ where: { id }, data: { active: false } });
  revalidatePath("/admin");
  go("Contract gedeactiveerd.");
}

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
