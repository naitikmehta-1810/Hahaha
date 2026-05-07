"use client";
import React, { useEffect, useState } from "react";
import Breadcrumb from "../Common/Breadcrumb";
import Image from "next/image";
import Orders from "../Orders";
const MyAccount = () => {
    const [activeTab, setActiveTab] = useState("dashboard");
    const [firstName, setFirstName] = useState("");
    const [lastName, setLastName] = useState("");
    const [email, setEmail] = useState("");
    const [fullName, setFullName] = useState("");
    const [currentPassword, setCurrentPassword] = useState("");
    const [newPassword, setNewPassword] = useState("");
    const [confirmNewPassword, setConfirmNewPassword] = useState("");
    const [profileMessage, setProfileMessage] = useState("");
    const [passwordMessage, setPasswordMessage] = useState("");
    const [errorMessage, setErrorMessage] = useState("");
    const [isLoading, setIsLoading] = useState(true);
    useEffect(() => {
        const loadProfile = async () => {
            var _a;
            try {
                const response = await fetch("/api/account/profile");
                const data = (await response.json());
                if (!response.ok) {
                    setErrorMessage((_a = data.error) !== null && _a !== void 0 ? _a : "Failed to load account details.");
                    return;
                }
                setFirstName(data.profile.firstName);
                setLastName(data.profile.lastName);
                setEmail(data.profile.email);
                setFullName(data.profile.fullName);
            }
            catch (_b) {
                setErrorMessage("Failed to load account details.");
            }
            finally {
                setIsLoading(false);
            }
        };
        void loadProfile();
    }, []);
    const handleProfileSubmit = async (event) => {
        var _a, _b, _c;
        event.preventDefault();
        setErrorMessage("");
        setProfileMessage("");
        try {
            const response = await fetch("/api/account/profile", {
                method: "PATCH",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ firstName, lastName }),
            });
            const data = (await response.json());
            if (!response.ok) {
                setErrorMessage((_a = data.error) !== null && _a !== void 0 ? _a : "Failed to update profile.");
                return;
            }
            setProfileMessage((_b = data.message) !== null && _b !== void 0 ? _b : "Profile updated.");
            setFullName((_c = data.fullName) !== null && _c !== void 0 ? _c : `${firstName} ${lastName}`.trim());
        }
        catch (_d) {
            setErrorMessage("Failed to update profile.");
        }
    };
    const handlePasswordSubmit = async (event) => {
        var _a, _b;
        event.preventDefault();
        setErrorMessage("");
        setPasswordMessage("");
        try {
            const response = await fetch("/api/account/password", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({
                    currentPassword,
                    newPassword,
                    confirmNewPassword,
                }),
            });
            const data = (await response.json());
            if (!response.ok) {
                setErrorMessage((_a = data.error) !== null && _a !== void 0 ? _a : "Failed to update password.");
                return;
            }
            setPasswordMessage((_b = data.message) !== null && _b !== void 0 ? _b : "Password updated.");
            setCurrentPassword("");
            setNewPassword("");
            setConfirmNewPassword("");
        }
        catch (_c) {
            setErrorMessage("Failed to update password.");
        }
    };
    return (<>
      <Breadcrumb title={"My Account"} pages={["my account"]}/>

      <section className="overflow-hidden py-20 bg-gray-2">
        <div className="max-w-[1170px] w-full mx-auto px-4 sm:px-8 xl:px-0">
          <div className="flex flex-col xl:flex-row gap-7.5">
            <div className="xl:max-w-[320px] w-full bg-white rounded-xl shadow-1 p-6">
              <div className="flex items-center gap-4 mb-6 border-b border-gray-3 pb-6">
                <div className="max-w-[56px] w-full h-14 rounded-full overflow-hidden">
                  <Image src="/images/users/user-04.jpg" alt="user" width={56} height={56}/>
                </div>
                <div>
                  <p className="font-medium text-dark">{fullName || "My Account"}</p>
                  <p className="text-custom-xs">{email || "Signed-in user"}</p>
                </div>
              </div>

              <div className="flex flex-col gap-3">
                <button onClick={() => setActiveTab("dashboard")} className={`rounded-md py-3 px-4 text-left ${activeTab === "dashboard" ? "bg-blue text-white" : "bg-gray-1 text-dark"}`}>
                  Dashboard
                </button>
                <button onClick={() => setActiveTab("orders")} className={`rounded-md py-3 px-4 text-left ${activeTab === "orders" ? "bg-blue text-white" : "bg-gray-1 text-dark"}`}>
                  Orders
                </button>
                <button onClick={() => setActiveTab("account-details")} className={`rounded-md py-3 px-4 text-left ${activeTab === "account-details" ? "bg-blue text-white" : "bg-gray-1 text-dark"}`}>
                  Account Details
                </button>
              </div>
            </div>

            <div className="xl:max-w-[820px] w-full">
              {errorMessage && (<div className="mb-4 rounded-md bg-red/10 px-4 py-3 text-red">{errorMessage}</div>)}

              {activeTab === "dashboard" && (<div className="bg-white rounded-xl shadow-1 p-6 sm:p-8">
                  <p className="text-dark">Hello {fullName || "User"}.</p>
                  <p className="text-custom-sm mt-4">
                    Manage your profile details and update your password from this account area.
                  </p>
                </div>)}

              {activeTab === "orders" && (<div className="bg-white rounded-xl shadow-1">
                  <Orders />
                </div>)}

              {activeTab === "account-details" && (<div className="flex flex-col gap-6">
                  <form onSubmit={handleProfileSubmit} className="bg-white rounded-xl shadow-1 p-6 sm:p-8">
                    <h3 className="font-medium text-dark text-xl mb-5">Profile Details</h3>
                    {profileMessage && <p className="mb-4 text-blue">{profileMessage}</p>}
                    <div className="grid sm:grid-cols-2 gap-5 mb-5">
                      <div>
                        <label htmlFor="firstName" className="block mb-2.5">
                          First Name <span className="text-red">*</span>
                        </label>
                        <input id="firstName" value={firstName} onChange={(event) => setFirstName(event.target.value)} required className="rounded-md border border-gray-3 bg-gray-1 w-full py-2.5 px-5 outline-none focus:border-transparent focus:shadow-input focus:ring-2 focus:ring-blue/20"/>
                      </div>
                      <div>
                        <label htmlFor="lastName" className="block mb-2.5">
                          Last Name
                        </label>
                        <input id="lastName" value={lastName} onChange={(event) => setLastName(event.target.value)} className="rounded-md border border-gray-3 bg-gray-1 w-full py-2.5 px-5 outline-none focus:border-transparent focus:shadow-input focus:ring-2 focus:ring-blue/20"/>
                      </div>
                    </div>
                    <div className="mb-5">
                      <label htmlFor="email" className="block mb-2.5">
                        Email Address
                      </label>
                      <input id="email" value={email} disabled className="rounded-md border border-gray-3 bg-gray-1 w-full py-2.5 px-5 outline-none text-dark-4"/>
                    </div>
                    <button type="submit" disabled={isLoading} className="inline-flex font-medium text-white bg-blue py-3 px-7 rounded-md hover:bg-blue-dark ease-out duration-200">
                      Save Changes
                    </button>
                  </form>

                  <form onSubmit={handlePasswordSubmit} className="bg-white rounded-xl shadow-1 p-6 sm:p-8">
                    <h3 className="font-medium text-dark text-xl mb-5">Password Change</h3>
                    {passwordMessage && <p className="mb-4 text-blue">{passwordMessage}</p>}
                    <div className="mb-5">
                      <label htmlFor="currentPassword" className="block mb-2.5">
                        Current Password
                      </label>
                      <input type="password" id="currentPassword" value={currentPassword} onChange={(event) => setCurrentPassword(event.target.value)} required className="rounded-md border border-gray-3 bg-gray-1 w-full py-2.5 px-5 outline-none focus:border-transparent focus:shadow-input focus:ring-2 focus:ring-blue/20"/>
                    </div>
                    <div className="mb-5">
                      <label htmlFor="newPassword" className="block mb-2.5">
                        New Password
                      </label>
                      <input type="password" id="newPassword" value={newPassword} onChange={(event) => setNewPassword(event.target.value)} minLength={6} required className="rounded-md border border-gray-3 bg-gray-1 w-full py-2.5 px-5 outline-none focus:border-transparent focus:shadow-input focus:ring-2 focus:ring-blue/20"/>
                    </div>
                    <div className="mb-5">
                      <label htmlFor="confirmNewPassword" className="block mb-2.5">
                        Confirm New Password
                      </label>
                      <input type="password" id="confirmNewPassword" value={confirmNewPassword} onChange={(event) => setConfirmNewPassword(event.target.value)} minLength={6} required className="rounded-md border border-gray-3 bg-gray-1 w-full py-2.5 px-5 outline-none focus:border-transparent focus:shadow-input focus:ring-2 focus:ring-blue/20"/>
                    </div>
                    <button type="submit" className="inline-flex font-medium text-white bg-blue py-3 px-7 rounded-md hover:bg-blue-dark ease-out duration-200">
                      Change Password
                    </button>
                  </form>
                </div>)}
            </div>
          </div>
        </div>
      </section>
    </>);
};
export default MyAccount;
