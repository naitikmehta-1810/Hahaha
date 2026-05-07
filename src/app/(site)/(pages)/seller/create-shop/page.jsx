import CreateShop from "@/components/Seller/CreateShop";
import { redirectSellerAwayFromCreateShop } from "@/utils/auth/seller-guard";

export const metadata = {
    title: "Create Shop | Stuffsy",
    description: "Create your seller shop on Stuffsy.",
};

const CreateShopPage = async () => {
    await redirectSellerAwayFromCreateShop();
    return (<main>
      <CreateShop />
    </main>);
};

export default CreateShopPage;
