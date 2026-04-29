import Home from "@/components/Home";
import { Metadata } from "next";

export const metadata: Metadata = {
  title: "Stuffsy",
  description: "This is Home for Stuffsy",
  // other metadata
};

export default function HomePage() {
  return (
    <>
      <Home />
    </>
  );
}
