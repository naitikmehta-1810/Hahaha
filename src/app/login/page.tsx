import type { Metadata } from "next";
import AuthPage from "@/components/auth/AuthPage";

export const metadata: Metadata = {
  title: "Stuffsy - Sign In",
  description: "Sign in to your Stuffsy account.",
};

export default function LoginPage() {
  return <AuthPage mode="signin" />;
}
