"use client";

import { ArrowRight } from "lucide-react";
import { ButtonLink } from "@/components/ui/Button/Button";
import { useAuth } from "@/components/auth/AuthProvider";

/** Sellers go to their hub; everyone else starts the shop wizard at /sell. */
export default function SellCta({ size = "lg" }: { size?: "md" | "lg" }) {
  const { user } = useAuth();
  const isSeller = Boolean(user?.isSeller);
  return (
    <ButtonLink
      href={isSeller ? "/seller" : "/sell"}
      size={size}
      variant="primary"
      rightIcon={<ArrowRight size={18} />}
    >
      {isSeller ? "Go to your seller hub" : "Open your shop"}
    </ButtonLink>
  );
}
