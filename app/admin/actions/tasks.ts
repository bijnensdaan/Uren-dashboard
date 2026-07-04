"use server";

import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/db";
import { taskFormSchema } from "@/lib/domain/admin";
import { activeFromForm, go } from "./helpers";

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
