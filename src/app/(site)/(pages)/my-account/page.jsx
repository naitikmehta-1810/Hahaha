import MyAccount from "@/components/MyAccount";
import React from "react";
export const metadata = {
    title: "My Account | Stuffsy",
    description: "This is My Account page for Stuffsy",
    // other metadata
};
const MyAccountPage = () => {
    return (<main>
      <MyAccount />
    </main>);
};
export default MyAccountPage;
