"use server";

import { refresh } from "next/cache";
import { z } from "zod";
import { assertUser } from "@/lib/auth/dal";
import { completeDeletionRequest, rejectDeletionRequest } from "@/lib/privacy";

export async function completeRequestAction(fd: FormData) {
  const user = await assertUser();
  await completeDeletionRequest(z.string().min(1).parse(fd.get("id")), user.id);
  refresh();
}

export async function rejectRequestAction(fd: FormData) {
  const user = await assertUser();
  const reason = z.string().trim().min(5).max(500).safeParse(fd.get("reason"));
  await rejectDeletionRequest(z.string().min(1).parse(fd.get("id")), user.id, reason.success ? reason.data : "Ditolak oleh pengelola");
  refresh();
}
