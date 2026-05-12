import { redirect } from "next/navigation";
import Dashboard from "@/components/Seller/Dashboard";
import { getCurrentUserFromHeaders } from "@/utils/auth/seller-guard";

export const metadata = {
    title: "Create Shop | Stuffsy",
    description: "Create your seller shop on Stuffsy.",
};

const SellerPage = async () => {
    const user = await getCurrentUserFromHeaders();
    if (!user) {
        redirect("/signin");
    }
    if (!user.is_seller) {
        redirect("/seller/create-shop/step_1");
    }

    return (<main>
      <Dashboard />
    </main>);
};
export default SellerPage;
