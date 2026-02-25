import type { Metadata } from "next";
import { Toaster } from "sonner";
import { Providers } from "./providers";
import "./globals.css";

export const metadata: Metadata = {
  title: "Sunder - AI Document Processing for Singapore SMEs",
  description:
    "AI-powered document processing platform for invoices, receipts, and contracts.",
  icons: {
    icon: "/favicon.svg",
  },
};

export default function RootLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  const organizationSchema = {
    "@context": "https://schema.org",
    "@type": "Organization",
    name: "Sunder",
    alternateName: ["Try Sunder", "Sunder AI", "Sunder Inc"],
    url: "https://www.trysunder.com",
    logo: "https://www.trysunder.com/neobot-logo.svg",
    description:
      "AI-powered document processing platform for invoices, receipts, and contracts.",
    address: {
      "@type": "PostalAddress",
      streetAddress: "109 North Bridge Road, Funan",
      addressLocality: "Singapore",
      postalCode: "179097",
      addressCountry: "SG",
    },
  };

  return (
    <html lang="en">
      <body>
        <script
          type="application/ld+json"
          dangerouslySetInnerHTML={{ __html: JSON.stringify(organizationSchema) }}
        />
        <Providers>{children}</Providers>
        <Toaster position="bottom-center" richColors />
      </body>
    </html>
  );
}
