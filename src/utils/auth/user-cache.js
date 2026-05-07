const USER_DISPLAY_NAME_KEY = "stuffsy_user_display_name";

export const getCachedUserDisplayName = () => {
  if (typeof window === "undefined") return "";
  return window.localStorage.getItem(USER_DISPLAY_NAME_KEY) || "";
};

export const setCachedUserDisplayName = (fullName) => {
  if (typeof window === "undefined") return;
  const displayName = fullName?.trim() || "";

  if (displayName) {
    window.localStorage.setItem(USER_DISPLAY_NAME_KEY, displayName);
    return;
  }

  window.localStorage.removeItem(USER_DISPLAY_NAME_KEY);
};

export const clearCachedUserDisplayName = () => {
  if (typeof window === "undefined") return;
  window.localStorage.removeItem(USER_DISPLAY_NAME_KEY);
};
