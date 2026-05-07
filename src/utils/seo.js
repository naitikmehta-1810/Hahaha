export const defaultMeta = {
  title: "Stuffsy — Modern Storefront",
  description: "Stuffsy — lightweight storefront template. Discover products, manage wishlist, and enjoy smooth shopping.",
  url: "https://stuffsy.app",
  image: "/images/logo/Stuffsy_logo.png",
};

export function generateJsonLd() {
  return {
    "@context": "https://schema.org",
    "@type": "Organization",
    name: "Stuffsy",
    url: defaultMeta.url,
    logo: defaultMeta.image,
  };
}
