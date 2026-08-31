import { requireChatGPTUser } from "../../chatgpt-auth";
import { X1B_BROWSER_LAUNCHER_PATH } from "../../../lib/x1b-browser-launcher.ts";
import { X1bFt161Launcher } from "./launcher";

export const dynamic = "force-dynamic";

export default async function X1bFt161LauncherPage() {
  await requireChatGPTUser(X1B_BROWSER_LAUNCHER_PATH);
  return <X1bFt161Launcher />;
}
