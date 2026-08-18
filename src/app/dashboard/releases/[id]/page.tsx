import type { Metadata } from "next";
import ReleaseClient from "./ReleaseClient";

export const metadata: Metadata = { title: "Release" };
export const dynamic = "force-dynamic";

export default function ReleasePage({ params }: { params: { id: string } }) {
  return <ReleaseClient id={params.id} />;
}
