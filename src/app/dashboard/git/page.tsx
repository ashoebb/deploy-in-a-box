import type { Metadata } from "next";
import GitClient from "./GitClient";

export const metadata: Metadata = { title: "Git & CI/CD" };
export const dynamic = "force-dynamic";

export default function GitPage() {
  return <GitClient />;
}
