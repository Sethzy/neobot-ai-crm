import type { Metadata, Viewport } from "next";
import { EB_Garamond } from "next/font/google";
import localFont from "next/font/local";
import { GeistMono } from "geist/font/mono";
import { Agentation } from "agentation";
import { Toaster } from "sonner";
import { Providers } from "./providers";
import "./globals.css";
import { siteBrand } from "@/lib/branding/site";
import { cn } from "@/lib/utils";

const figtree = localFont({
  src: [
    { path: "../public/fonts/figtree-latin-wght-normal.woff2", style: "normal" },
    { path: "../public/fonts/figtree-latin-wght-italic.woff2", style: "italic" },
  ],
  variable: "--font-ui",
  display: "swap",
});

const ebGaramond = EB_Garamond({
  subsets: ["latin"],
  weight: ["400", "500", "600"],
  style: ["normal", "italic"],
  variable: "--font-display",
  display: "swap",
});

export const metadata: Metadata = {
  title: siteBrand.marketingTitle,
  description: siteBrand.marketingDescription,
  icons: {
    icon: "/favicon.svg",
  },
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover",
};

const isAgentationEnabled =
  process.env.NODE_ENV === "development" &&
  process.env.NEXT_PUBLIC_ENABLE_AGENTATION === "1";

export default function RootLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  const organizationSchema = {
    "@context": "https://schema.org",
    "@type": "Organization",
    name: siteBrand.name,
    alternateName: ["NeoBot AI", "NeoBot AI CRM", "NeoBot CRM"],
    url: siteBrand.siteUrl,
    logo: siteBrand.logoUrl,
    description: siteBrand.organizationDescription,
    address: {
      "@type": "PostalAddress",
      streetAddress: "109 North Bridge Road, Funan",
      addressLocality: "Singapore",
      postalCode: "179097",
      addressCountry: "SG",
    },
  };

  return (
    <html lang="en" className={cn(GeistMono.variable, figtree.variable, ebGaramond.variable)}>
      <body>
        <script
          type="application/ld+json"
          dangerouslySetInnerHTML={{ __html: JSON.stringify(organizationSchema) }}
        />
        <Providers>{children}</Providers>
        <Toaster position="bottom-right" richColors />
        {isAgentationEnabled ? <Agentation /> : null}
      </body>
    </html>
  );
}
