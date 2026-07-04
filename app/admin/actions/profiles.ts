"use server";

import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/db";
import { profileFormSchema } from "@/lib/domain/admin";
import { activeFromForm, go } from "./helpers";

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
