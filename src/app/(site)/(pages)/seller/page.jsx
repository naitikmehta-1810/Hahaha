import { redirect } from "next/navigation";
import CreateShop from "@/components/Seller/CreateShop";
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

    return (<main>
      <CreateShop />
    </main>);
};
export default SellerPage;
