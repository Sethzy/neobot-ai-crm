import type { Metadata } from "next";
import Link from "next/link";
import { industries } from "@/data/industries";
import { Header } from "@/components/landing/Header";
import { Footer } from "@/components/landing/Footer";
import { Container } from "@/components/landing/Container";
import {
  TbArrowRight,
  TbCalculator,
  TbScale,
  TbTruck,
} from "react-icons/tb";

const industryIcons = {
  accounting: TbCalculator,
  legal: TbScale,
  logistics: TbTruck,
} as const;

export const metadata: Metadata = {
  title: "Document Processing by Industry | Sunder",
  description:
    "Document processing for accounting firms, law practices, and logistics companies. See how Sunder handles the specific documents your industry deals with.",
  alternates: { canonical: "https://www.trysunder.com/industries" },
};

export default function IndustriesIndexPage() {
  const breadcrumbSchema = {
    "@context": "https://schema.org",
    "@type": "BreadcrumbList",
    itemListElement: [
      {
        "@type": "ListItem",
        position: 1,
        name: "Home",
        item: "https://www.trysunder.com",
      },
      {
        "@type": "ListItem",
        position: 2,
        name: "Industries",
        item: "https://www.trysunder.com/industries",
      },
    ],
  };

  return (
    <div className="landing-page min-h-screen bg-white selection:bg-indigo-100 selection:text-indigo-900">
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(breadcrumbSchema) }}
      />
      <Header />
      <main>
        <section className="py-20 sm:py-28">
          <Container>
            <div className="mx-auto max-w-3xl text-center">
              <h1 className="font-serif text-4xl font-medium tracking-tight text-zinc-900 sm:text-5xl">
                What Industry Are You In?
              </h1>
              <p className="mt-6 text-lg leading-relaxed text-zinc-600">
                Accountants process invoices and receipts. Lawyers deal with
                contracts. Freight forwarders handle bills of lading. Pick your
                industry below to see how Sunder fits your workflow.
              </p>
            </div>
          </Container>
        </section>

        <section className="pb-20">
          <Container>
            <div className="mx-auto grid max-w-5xl gap-8 lg:grid-cols-3">
              {industries.map((industry) => {
                const Icon =
                  industryIcons[industry.slug as keyof typeof industryIcons] ||
                  TbCalculator;
                return (
                  <Link
                    key={industry.slug}
                    href={`/industries/${industry.slug}`}
                    className="group rounded-2xl border border-zinc-200 bg-white p-8 shadow-sm transition-all hover:border-sunder-green hover:shadow-md"
                  >
                    <div className="flex h-14 w-14 items-center justify-center rounded-xl bg-sunder-green/10">
                      <Icon className="h-7 w-7 text-sunder-green" />
                    </div>
                    <h2 className="mt-6 text-xl font-semibold text-zinc-900 transition-colors group-hover:text-sunder-green">
                      {industry.title}
                    </h2>
                    <p className="mt-3 leading-relaxed text-zinc-600">
                      {industry.description}
                    </p>
                    <div className="mt-4 flex flex-wrap gap-2">
                      {industry.documentTypes.slice(0, 3).map((docType) => (
                        <span
                          key={docType}
                          className="rounded-full bg-zinc-100 px-3 py-1 text-xs font-medium text-zinc-600"
                        >
                          {docType}
                        </span>
                      ))}
                      {industry.documentTypes.length > 3 && (
                        <span className="rounded-full bg-zinc-100 px-3 py-1 text-xs font-medium text-zinc-600">
                          +{industry.documentTypes.length - 3} more
                        </span>
                      )}
                    </div>
                    <div className="mt-6 flex items-center gap-2 text-sm font-medium text-sunder-green">
                      Learn more
                      <TbArrowRight className="h-4 w-4 transition-transform group-hover:translate-x-1" />
                    </div>
                  </Link>
                );
              })}
            </div>
          </Container>
        </section>

        <section className="bg-zinc-50 py-20">
          <Container>
            <div className="mx-auto max-w-2xl text-center">
              <h2 className="font-serif text-3xl font-medium tracking-tight text-zinc-900">
                Different Industry?
              </h2>
              <p className="mt-4 text-zinc-600">
                Sunder reads any document with text on it. If your industry is
                not listed above, book a demo and show us what you are working
                with. We will tell you if we can help.
              </p>
              <div className="mt-8">
                <Link
                  href="/login"
                  className="inline-flex items-center gap-2 rounded-full bg-sunder-green px-8 py-4 text-base font-semibold text-white shadow-sm transition-colors hover:bg-sunder-green-dark"
                >
                  Book a Demo
                  <TbArrowRight className="h-4 w-4" />
                </Link>
              </div>
            </div>
          </Container>
        </section>
      </main>
      <Footer />
    </div>
  );
}
