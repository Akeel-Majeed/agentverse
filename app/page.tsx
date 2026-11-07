import { cookies } from "next/headers";
import { redirect } from "next/navigation";

/** First visit goes through setup; after that the app opens on the overview. */
export default function Home() {
  redirect(cookies().get("onboarded") ? "/overview" : "/onboarding");
}
