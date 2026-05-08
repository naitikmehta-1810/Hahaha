import React, { useState } from "react";
const Login = ({ currentUser, onSignedIn }) => {
    const [dropdown, setDropdown] = useState(false);
    const [email, setEmail] = useState("");
    const [password, setPassword] = useState("");
    const [errorMessage, setErrorMessage] = useState("");
    const [isSubmitting, setIsSubmitting] = useState(false);
    const [successMessage, setSuccessMessage] = useState("");
    const handleSubmit = async (event) => {
        var _a, _b;
        event.preventDefault();
        setErrorMessage("");
        setSuccessMessage("");
        setIsSubmitting(true);
        try {
            const signinResponse = await fetch("/api/signin", {
                method: "POST",
                headers: {
                    "Content-Type": "application/json",
                },
                body: JSON.stringify({ email, password }),
            });
            const signinData = await signinResponse.json();
            if (!signinResponse.ok) {
                setErrorMessage((_a = signinData.error) !== null && _a !== void 0 ? _a : "Unable to sign in.");
                return;
            }
            const meResponse = await fetch("/api/me");
            const meData = await meResponse.json();
            if (!meResponse.ok || !meData.user) {
                setErrorMessage("Signed in, but failed to load user details.");
                return;
            }
            onSignedIn(meData.user);
            setDropdown(false);
            setEmail("");
            setPassword("");
            setSuccessMessage(`Signed in as ${(_b = meData.user.fullName) !== null && _b !== void 0 ? _b : "user"}.`);
        }
        catch (_c) {
            setErrorMessage("Something went wrong. Please try again.");
        }
        finally {
            setIsSubmitting(false);
        }
    };
    if (currentUser) {
        return null;
    }
    return (<div className="bg-white shadow-1 rounded-[10px]">
      <div onClick={() => setDropdown(!dropdown)} className={`cursor-pointer flex items-center gap-0.5 py-5 px-5.5 ${dropdown && "border-b border-gray-3"}`}>
        Returning customer?
        <span className="flex items-center gap-2.5 pl-1 font-medium text-dark">
          Click here to sign in
          <svg className={`${dropdown && "rotate-180"} fill-current ease-out duration-200`} width="22" height="22" viewBox="0 0 22 22" fill="none" xmlns="http://www.w3.org/2000/svg">
            <path fillRule="evenodd" clipRule="evenodd" d="M4.06103 7.80259C4.30813 7.51431 4.74215 7.48092 5.03044 7.72802L10.9997 12.8445L16.9689 7.72802C17.2572 7.48092 17.6912 7.51431 17.9383 7.80259C18.1854 8.09088 18.1521 8.5249 17.8638 8.772L11.4471 14.272C11.1896 14.4927 10.8097 14.4927 10.5523 14.272L4.1356 8.772C3.84731 8.5249 3.81393 8.09088 4.06103 7.80259Z" fill=""/>
          </svg>
        </span>
      </div>

      {/* <!-- dropdown menu --> */}
      <form onSubmit={handleSubmit} className={`${dropdown ? "block" : "hidden"} pt-7.5 pb-8.5 px-4 sm:px-8.5`}>
        <p className="text-custom-sm mb-6">
          If you already have an account, please sign in first.
        </p>

        <div className="mb-5">
          <label htmlFor="checkoutEmail" className="block mb-2.5">
            Email
          </label>

          <input type="email" name="checkoutEmail" id="checkoutEmail" value={email} onChange={(event) => setEmail(event.target.value)} required className="rounded-md border border-gray-3 bg-gray-1 placeholder:text-dark-5 w-full py-2.5 px-5 outline-none duration-200 focus:border-transparent focus:shadow-input focus:ring-2 focus:ring-blue/20"/>
        </div>

        <div className="mb-5">
          <label htmlFor="checkoutPassword" className="block mb-2.5">
            Password
          </label>

          <input type="password" name="checkoutPassword" id="checkoutPassword" autoComplete="on" value={password} onChange={(event) => setPassword(event.target.value)} required className="rounded-md border border-gray-3 bg-gray-1 placeholder:text-dark-5 w-full py-2.5 px-5 outline-none duration-200 focus:border-transparent focus:shadow-input focus:ring-2 focus:ring-blue/20"/>
        </div>

        {errorMessage && <p className="mb-4 text-red">{errorMessage}</p>}
        {successMessage && <p className="mb-4 text-blue">{successMessage}</p>}

        <button type="submit" disabled={isSubmitting} className="inline-flex font-medium text-white bg-blue py-3 px-10.5 rounded-md ease-out duration-200 hover:bg-blue-dark disabled:opacity-70">
          {isSubmitting ? "Signing in..." : "Sign in"}
        </button>
      </form>
    </div>);
};
export default Login;
