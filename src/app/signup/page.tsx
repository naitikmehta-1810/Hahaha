import type { Metadata } from "next";
import AuthPage from "@/components/auth/AuthPage";

export const metadata: Metadata = {
  title: "Stuffsy - Sign Up",
  description: "Create a Stuffsy account.",
};

export default function SignUpPage() {
  return <AuthPage mode="signup" />;
}
