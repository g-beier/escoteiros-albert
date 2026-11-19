import { redirect } from "next/navigation";
import { ASSOCIATES_SETTINGS_HOME } from "@/components/associates/app-header";

export default function SettingsPage() {
  redirect(ASSOCIATES_SETTINGS_HOME);
}
