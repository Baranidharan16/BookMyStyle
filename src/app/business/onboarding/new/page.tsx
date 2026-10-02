import { redirect } from "next/navigation";

export default function NewSalon() {
  redirect("/business/onboarding?fresh=1");
}
