import CreateShopWizard from "@/components/Seller/CreateShopWizard";
import { redirectSellerAwayFromCreateShop } from "@/utils/auth/seller-guard";

export const metadata = {
    title: "Create Shop - Step 1 | Stuffsy",
    description: "Choose categories for your seller shop.",
};

const CreateShopStep1Page = async () => {
    await redirectSellerAwayFromCreateShop();
    return (<main>
      <CreateShopWizard stepKey="step_1" />
    </main>);
};

export default CreateShopStep1Page;
