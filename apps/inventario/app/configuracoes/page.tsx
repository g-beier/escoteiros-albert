import { redirect } from "next/navigation";
import { SETTINGS_HOME } from "@/components/settings-tabs";

export default function SettingsPage() {
  redirect(SETTINGS_HOME);
}
