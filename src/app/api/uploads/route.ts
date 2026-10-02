import { requireUser } from "@/server/auth/session";
import { ok, route } from "@/server/http/handler";
import { Errors } from "@/server/http/errors";
import { rateLimit } from "@/server/http/rate-limit";
import { putImage } from "@/server/storage";

/** POST multipart/form-data { file, folder } → { url }. Images only, size- and type-checked server-side. */
export const POST = route(async (req) => {
  const user = await requireUser();
  await rateLimit(`upload:${user.id}`, 40, 3600);
  const form = await req.formData();
  const file = form.get("file");
  if (!(file instanceof File)) throw Errors.validation("No file uploaded.");
  const folder = String(form.get("folder") ?? "misc");
  const res = await putImage(Buffer.from(await file.arrayBuffer()), ["salons", "staff", "avatars", "services"].includes(folder) ? folder : "misc");
  return ok(res, { status: 201 });
});
