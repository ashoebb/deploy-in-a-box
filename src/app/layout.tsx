import type { Metadata } from "next";
import "@fontsource-variable/archivo";
import "@fontsource-variable/inter";
import "@fontsource-variable/jetbrains-mono";
import "./globals.css";

export const metadata: Metadata = {
  title: {
    default: "Deploy-in-a-Box, Production multi-tenant SaaS infrastructure, provisioned automatically",
    template: "%s · Deploy-in-a-Box",
  },
  description:
    "A pre-built multi-tenant SaaS backend, auth, billing, CI/CD, and AWS infrastructure as code, provisioned into your AWS account automatically. Weeks of platform engineering, delivered in under an hour.",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
