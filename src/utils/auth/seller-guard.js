import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { getCurrentUserFromRequest } from "@/utils/auth/current-user";

export const getCurrentUserFromHeaders = async () => {
    const requestHeaders = await headers();
    return getCurrentUserFromRequest({ headers: requestHeaders });
};

export const requireSellerPageAccess = async () => {
    const user = await getCurrentUserFromHeaders();
    if (!user) {
        redirect("/signin");
    }
    if (!user.is_seller) {
        redirect("/seller/create-shop/step_1");
    }
    return user;
};

export const redirectSellerAwayFromCreateShop = async () => {
    const user = await getCurrentUserFromHeaders();
    if (!user) {
        redirect("/signin");
    }
    if (user.is_seller) {
        redirect("/seller");
    }
    return user;
};
