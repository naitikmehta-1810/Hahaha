const USER_DISPLAY_NAME_KEY = "stuffsy_user_display_name";
export const USER_DISPLAY_NAME_CHANGED_EVENT = "stuffsy:user-display-name-changed";

const notifyUserDisplayNameChanged = (fullName) => {
  window.dispatchEvent(
    new CustomEvent(USER_DISPLAY_NAME_CHANGED_EVENT, {
      detail: { fullName },
    })
  );
};

export const getCachedUserDisplayName = () => {
  if (typeof window === "undefined") return "";
  return window.localStorage.getItem(USER_DISPLAY_NAME_KEY) || "";
};

export const setCachedUserDisplayName = (fullName) => {
  if (typeof window === "undefined") return;
  const displayName = fullName?.trim() || "";

  if (displayName) {
    window.localStorage.setItem(USER_DISPLAY_NAME_KEY, displayName);
    notifyUserDisplayNameChanged(displayName);
    return;
  }

  window.localStorage.removeItem(USER_DISPLAY_NAME_KEY);
  notifyUserDisplayNameChanged("");
};

export const clearCachedUserDisplayName = () => {
  if (typeof window === "undefined") return;
  window.localStorage.removeItem(USER_DISPLAY_NAME_KEY);
  notifyUserDisplayNameChanged("");
};
