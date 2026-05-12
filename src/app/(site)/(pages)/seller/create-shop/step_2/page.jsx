import CreateShopWizard from "@/components/Seller/CreateShopWizard";
import { redirectSellerAwayFromCreateShop } from "@/utils/auth/seller-guard";

export const metadata = {
    title: "Create Shop - Step 2 | Stuffsy",
    description: "Add your shop name and contact number.",
};

const CreateShopStep2Page = async () => {
    await redirectSellerAwayFromCreateShop();
    return (<main>
      <CreateShopWizard stepKey="step_2" />
    </main>);
};

export default CreateShopStep2Page;
