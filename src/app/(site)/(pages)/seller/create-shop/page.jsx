import { redirect } from "next/navigation";
import { redirectSellerAwayFromCreateShop } from "@/utils/auth/seller-guard";

export const metadata = {
    title: "Create Shop | Stuffsy",
    description: "Create your seller shop on Stuffsy.",
};

const CreateShopPage = async () => {
    await redirectSellerAwayFromCreateShop();
    redirect("/seller/create-shop/step_1");
};

export default CreateShopPage;
