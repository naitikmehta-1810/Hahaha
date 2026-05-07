"use client";
import { useState, useEffect } from "react";
import "../css/euclid-circular-a-font.css";
import "../css/style.css";
import Header from "../../components/Header";
import Footer from "../../components/Footer";
import { defaultMeta, generateJsonLd } from "@/utils/seo";
import { ModalProvider } from "../context/QuickViewModalContext";
import { CartModalProvider } from "../context/CartSidebarModalContext";
import { ReduxProvider } from "@/redux/provider";
import QuickViewModal from "@/components/Common/QuickViewModal";
import CartSidebarModal from "@/components/Common/CartSidebarModal";
import { PreviewSliderProvider } from "../context/PreviewSliderContext";
import PreviewSliderModal from "@/components/Common/PreviewSlider";
import ScrollToTop from "@/components/Common/ScrollToTop";
import PreLoader from "@/components/Common/PreLoader";
export default function RootLayout({ children, }) {
    const [loading, setLoading] = useState(true);
    useEffect(() => {
        setTimeout(() => setLoading(false), 1000);
    }, []);
    return (<html lang="en" suppressHydrationWarning={true}>
      <head>
        <meta charSet="utf-8" />
        <meta name="viewport" content="width=device-width, initial-scale=1" />
        <title>{defaultMeta.title}</title>
        <meta name="description" content={defaultMeta.description} />
        <meta property="og:title" content={defaultMeta.title} />
        <meta property="og:description" content={defaultMeta.description} />
        <meta property="og:type" content="website" />
        <meta property="og:url" content={defaultMeta.url} />
        <meta property="og:image" content={defaultMeta.image} />
        <meta name="twitter:card" content="summary_large_image" />
        <meta name="twitter:title" content={defaultMeta.title} />
        <meta name="twitter:description" content={defaultMeta.description} />
        <meta name="twitter:image" content={defaultMeta.image} />
        <link rel="canonical" href={defaultMeta.url} />
        <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(generateJsonLd()) }} />
      </head>
      <body>
        {loading ? (<PreLoader />) : (<>
            <ReduxProvider>
              <CartModalProvider>
                <ModalProvider>
                  <PreviewSliderProvider>
                    <Header />
                    {children}

                    <QuickViewModal />
                    <CartSidebarModal />
                    <PreviewSliderModal />
                  </PreviewSliderProvider>
                </ModalProvider>
              </CartModalProvider>
            </ReduxProvider>
            <ScrollToTop />
            <Footer />
          </>)}
      </body>
    </html>);
}
