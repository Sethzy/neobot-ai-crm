import type { Metadata } from "next";
import Link from "next/link";
import { useCases } from "@/data/use-cases";
import { Header } from "@/components/landing/Header";
import { Footer } from "@/components/landing/Footer";
import { Container } from "@/components/landing/Container";
import {
  ArrowRight,
  FileText,
  Receipt,
  FileCheck,
  ClipboardList,
} from "lucide-react";

const useCaseIcons = {
  invoices: FileText,
  receipts: Receipt,
  contracts: FileCheck,
  forms: ClipboardList,
} as const;

export const metadata: Metadata = {
  title: "Document Processing by Type | Sunder",
  description:
    "Turn invoices, receipts, contracts, and forms into structured Excel data. Upload documents, get clean data back. Built for Singapore SMEs.",
  alternates: { canonical: "https://www.trysunder.com/use-cases" },
};

export default function UseCasesIndexPage() {
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
        name: "Use Cases",
        item: "https://www.trysunder.com/use-cases",
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
                What Documents Do You Need to Process?
              </h1>
              <p className="mt-6 text-lg leading-relaxed text-zinc-600">
                Invoices, receipts, contracts, or forms. Pick your document type
                below. Upload files to Sunder and get structured data back in
                Excel format, ready to use.
              </p>
            </div>
          </Container>
        </section>

        <section className="pb-20">
          <Container>
            <div className="mx-auto grid max-w-5xl gap-8 sm:grid-cols-2">
              {useCases.map((useCase) => {
                const Icon =
                  useCaseIcons[useCase.slug as keyof typeof useCaseIcons] ||
                  FileText;
                return (
                  <Link
                    key={useCase.slug}
                    href={`/use-cases/${useCase.slug}`}
                    className="group rounded-2xl border border-zinc-200 bg-white p-8 shadow-sm transition-all hover:border-sunder-green hover:shadow-md"
                  >
                    <div className="flex h-14 w-14 items-center justify-center rounded-xl bg-sunder-green/10">
                      <Icon className="h-7 w-7 text-sunder-green" />
                    </div>
                    <h2 className="mt-6 text-xl font-semibold text-zinc-900 transition-colors group-hover:text-sunder-green">
                      {useCase.title}
                    </h2>
                    <p className="mt-3 leading-relaxed text-zinc-600">
                      {useCase.description}
                    </p>
                    <div className="mt-6 flex items-center gap-2 text-sm font-medium text-sunder-green">
                      Learn more
                      <ArrowRight className="h-4 w-4 transition-transform group-hover:translate-x-1" />
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
                Have a Mix of Document Types?
              </h2>
              <p className="mt-4 text-zinc-600">
                Most businesses process invoices, receipts, and contracts
                together. Book a demo and we will show you how Sunder handles
                all of them in one workflow.
              </p>
              <div className="mt-8">
                <Link
                  href="/login"
                  className="inline-flex items-center gap-2 rounded-full bg-sunder-green px-8 py-4 text-base font-semibold text-white shadow-sm transition-colors hover:bg-sunder-green-dark"
                >
                  Book a Demo
                  <ArrowRight className="h-4 w-4" />
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
