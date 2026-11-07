import { redirect } from "next/navigation";
import { getRisks } from "@/lib/data";

export default async function RisksIndex() {
  const [top] = await getRisks();
  redirect(`/risks/${top.id}`);
}
