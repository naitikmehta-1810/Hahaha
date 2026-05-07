import React from "react";
import { Wishlist } from "@/components/Wishlist";
export const metadata = {
    title: "Wishlist Page | Stuffsy",
    description: "This is Wishlist Page for Stuffsy",
    // other metadata
};
const WishlistPage = () => {
    return (<main>
      <Wishlist />
    </main>);
};
export default WishlistPage;
