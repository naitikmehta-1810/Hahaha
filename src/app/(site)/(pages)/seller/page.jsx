import { redirect } from "next/navigation";
import CreateShop from "@/components/Seller/CreateShop";
import { getCurrentUserFromHeaders } from "@/utils/auth/seller-guard";

export const metadata = {
    title: "Seller Dashboard | Stuffsy",
    description: "Manage your seller shop on Stuffsy.",
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
      <CreateShop />
    </main>);
};
export default SellerPage;
