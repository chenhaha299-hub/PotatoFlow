import PotatoFlowApp from "./PotatoFlowApp";
import { getChatGPTUser } from "./chatgpt-auth";

export const dynamic = "force-dynamic";

export default async function Home() {
  const user = await getChatGPTUser();
  return <PotatoFlowApp syncEnabled={Boolean(user)} />;
}
