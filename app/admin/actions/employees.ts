"use server";

import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/db";
import { employeeFormSchema } from "@/lib/domain/admin";
import { activeFromForm, go } from "./helpers";

export async function createEmployee(formData: FormData) {
  try {
    const parsed = employeeFormSchema.parse({
      name: formData.get("name"),
      profileCategoryId: formData.get("profileCategoryId"),
      weeklyCapacityHours: formData.get("weeklyCapacityHours") ?? 40,
      active: true,
    });
    await prisma.employee.create({
      data: {
        name: parsed.name,
        profileCategoryId: parsed.profileCategoryId,
        weeklyCapacityHours: parsed.weeklyCapacityHours,
      },
    });
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
      weeklyCapacityHours: formData.get("weeklyCapacityHours") ?? 40,
      active: activeFromForm(formData),
    });
    await prisma.employee.update({
      where: { id: parsed.id! },
      data: {
        name: parsed.name,
        profileCategoryId: parsed.profileCategoryId,
        weeklyCapacityHours: parsed.weeklyCapacityHours,
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
