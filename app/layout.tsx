import type { Metadata, Viewport } from "next";
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

const fraunces = localFont({
  src: [
    { path: "../public/fonts/fraunces-latin-full-normal.woff2", style: "normal" },
    { path: "../public/fonts/fraunces-latin-full-italic.woff2", style: "italic" },
  ],
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
    alternateName: ["Try Sunder", "Sunder AI", "Sunder Inc"],
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
    <html lang="en" className={cn(GeistMono.variable, figtree.variable, fraunces.variable)}>
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
