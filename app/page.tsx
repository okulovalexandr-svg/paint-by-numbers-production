import { getChatGPTUser } from "./chatgpt-auth";
import Studio from "./studio";

export const dynamic = "force-dynamic";

export default async function Home() {
  const user = await getChatGPTUser();

  return (
    <Studio
      viewer={{
        name: user?.displayName ?? "Александр",
        email: user?.email ?? "owner@hobruk.ru",
      }}
    />
  );
}
