import CreateShopWizard from "@/components/Seller/CreateShopWizard";
import { redirectSellerAwayFromCreateShop } from "@/utils/auth/seller-guard";

export const metadata = {
    title: "Create Shop - Step 3 | Stuffsy",
    description: "Agree to terms and create your seller shop.",
};

const CreateShopStep3Page = async () => {
    await redirectSellerAwayFromCreateShop();
    return (<main>
      <CreateShopWizard stepKey="step_3" />
    </main>);
};

export default CreateShopStep3Page;
