import Home from "@/components/Home";
import React from "react";

import { Metadata } from "next";
export const metadata: Metadata = {
  title: "Home | Stuffsy",
  description: "This is Home for Stuffsy Template",
};

const HomePage = () => {
  return (
    <main>
      <Home />
    </main>
  );
};

export default HomePage;
