import { defaultMeta, generateJsonLd } from "@/utils/seo";

export default function Head() {
  const jsonLd = JSON.stringify(generateJsonLd());

  return (
    <>
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
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: jsonLd }} />
    </>
  );
}
