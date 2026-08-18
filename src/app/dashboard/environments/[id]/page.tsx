import type { Metadata } from "next";
import EnvironmentClient from "./EnvironmentClient";

export const metadata: Metadata = { title: "Environment" };
export const dynamic = "force-dynamic";

export default function EnvironmentPage({ params }: { params: { id: string } }) {
  return <EnvironmentClient id={params.id} />;
}
