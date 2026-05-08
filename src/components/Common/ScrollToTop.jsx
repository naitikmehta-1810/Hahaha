"use client";
import { useEffect, useState } from "react";
export default function ScrollToTop() {
    const [isVisible, setIsVisible] = useState(false);
    // Top: 0 takes us all the way back to the top of the page
    // Behavior: smooth keeps it smooth!
    const scrollToTop = () => {
        window.scrollTo({
            top: 0,
            behavior: "smooth",
        });
    };
    useEffect(() => {
        let rafId = null;
        const toggleVisibility = () => {
            const nextVisibleState = window.pageYOffset > 300;
            setIsVisible((prev) => (prev === nextVisibleState ? prev : nextVisibleState));
        };
        const handleScroll = () => {
            if (rafId !== null) {
                return;
            }
            rafId = window.requestAnimationFrame(() => {
                toggleVisibility();
                rafId = null;
            });
        };
        toggleVisibility();
        window.addEventListener("scroll", handleScroll, { passive: true });
        return () => {
            window.removeEventListener("scroll", handleScroll);
            if (rafId !== null) {
                window.cancelAnimationFrame(rafId);
            }
        };
    }, []);
    return (<>
      {isVisible && (<button onClick={scrollToTop} className={`items-center justify-center w-10 h-10 rounded-[4px] shadow-lg bg-blue ease-out duration-200 hover:bg-blue-dark fixed bottom-8 right-8 z-999 ${isVisible ? "flex" : "hidden"}`}>
          <svg className="fill-white w-5 h-5" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 512 512">
            <path d="M233.4 105.4c12.5-12.5 32.8-12.5 45.3 0l192 192c12.5 12.5 12.5 32.8 0 45.3s-32.8 12.5-45.3 0L256 173.3 86.6 342.6c-12.5 12.5-32.8 12.5-45.3 0s-12.5-32.8 0-45.3l192-192z"/>
          </svg>
        </button>)}
    </>);
}
