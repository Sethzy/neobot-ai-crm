import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { getIndustry } from "@/data/industries";
import { useCases } from "@/data/use-cases";
import { Header } from "@/components/landing/Header";
import { Footer } from "@/components/landing/Footer";
import { Container } from "@/components/landing/Container";
import {
  AlertTriangle,
  Clock,
  Search,
  FileX,
  Edit,
  Layers,
  Check,
  ArrowRight,
  FileText,
  Receipt,
  FileCheck,
  ClipboardList,
} from "lucide-react";

const iconMap = {
  "alert-triangle": AlertTriangle,
  clock: Clock,
  search: Search,
  "file-x": FileX,
  edit: Edit,
  layers: Layers,
} as const;

const useCaseIcons = {
  invoices: FileText,
  receipts: Receipt,
  contracts: FileCheck,
  forms: ClipboardList,
} as const;

export async function generateMetadata({
  params,
}: {
  params: Promise<{ slug: string }>;
}): Promise<Metadata> {
  const { slug } = await params;
  const industry = getIndustry(slug);
  if (!industry) return { title: "Not Found | Sunder" };

  const url = `https://www.trysunder.com/industries/${industry.slug}`;
  return {
    title: industry.metaTitle,
    description: industry.metaDescription,
    alternates: { canonical: url },
    openGraph: {
      title: industry.metaTitle,
      description: industry.metaDescription,
      images: ["https://www.trysunder.com/exports/og-image.png"],
      url,
      type: "website",
    },
    twitter: {
      card: "summary_large_image",
      title: industry.metaTitle,
      description: industry.metaDescription,
      images: ["https://www.trysunder.com/exports/og-image.png"],
    },
  };
}

export default async function IndustryPage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  const industry = getIndustry(slug);
  if (!industry) notFound();

  const serviceSchema = {
    "@context": "https://schema.org",
    "@type": "Service",
    name: `${industry.title} Document Processing`,
    description: industry.metaDescription,
    provider: { "@type": "Organization", name: "Sunder" },
    areaServed: { "@type": "Country", name: "Singapore" },
    serviceType: industry.title,
  };

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
        name: industry.title,
        item: `https://www.trysunder.com/industries/${industry.slug}`,
      },
    ],
  };

  return (
    <div className="landing-page min-h-screen bg-white selection:bg-indigo-100 selection:text-indigo-900">
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(serviceSchema) }}
      />
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
                {industry.headline}
              </h1>
              <p className="mt-6 text-lg leading-relaxed text-zinc-600">
                {industry.description}
              </p>
              <div className="mt-10">
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

        <section className="bg-sunder-green/5 py-16">
          <Container>
            <div className="mx-auto max-w-2xl text-center">
              <h2 className="font-serif text-3xl font-medium tracking-tight text-zinc-900">
                Documents We Process
              </h2>
              <p className="mt-4 text-zinc-600">
                Sunder handles the documents that matter most to your{" "}
                {industry.title.toLowerCase()} workflow.
              </p>
            </div>
            <div className="mx-auto mt-12 flex max-w-3xl flex-wrap justify-center gap-4">
              {industry.documentTypes.map((docType, i) => (
                <div
                  key={i}
                  className="flex items-center gap-2 rounded-full border border-zinc-100 bg-white px-5 py-3 shadow-sm"
                >
                  <FileText className="h-5 w-5 text-sunder-green" />
                  <span className="font-medium text-zinc-900">{docType}</span>
                </div>
              ))}
            </div>
          </Container>
        </section>

        <section className="bg-zinc-50 py-16">
          <Container>
            <div className="mx-auto max-w-2xl text-center">
              <h2 className="font-serif text-3xl font-medium tracking-tight text-zinc-900">
                The Problem
              </h2>
              <p className="mt-4 text-zinc-600">
                Manual document processing creates friction in{" "}
                {industry.title.toLowerCase()} operations.
              </p>
            </div>
            <div className="mx-auto mt-12 grid max-w-5xl gap-8 sm:grid-cols-3">
              {industry.problems.map((problem, i) => {
                const Icon = iconMap[problem.icon];
                return (
                  <div
                    key={i}
                    className="rounded-2xl border border-zinc-100 bg-white p-6 shadow-sm"
                  >
                    <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-red-50">
                      <Icon className="h-6 w-6 text-red-600" />
                    </div>
                    <h3 className="mt-4 font-semibold text-zinc-900">
                      {problem.title}
                    </h3>
                    <p className="mt-2 text-sm leading-relaxed text-zinc-600">
                      {problem.description}
                    </p>
                  </div>
                );
              })}
            </div>
          </Container>
        </section>

        <section className="py-16">
          <Container>
            <div className="mx-auto max-w-2xl text-center">
              <h2 className="font-serif text-3xl font-medium tracking-tight text-zinc-900">
                The Sunder Solution
              </h2>
              <p className="mt-4 text-zinc-600">
                AI-powered extraction built for{" "}
                {industry.title.toLowerCase()} workflows.
              </p>
            </div>
            <div className="mx-auto mt-12 grid max-w-5xl gap-8 sm:grid-cols-3">
              {industry.benefits.map((benefit, i) => (
                <div
                  key={i}
                  className="rounded-2xl border border-sunder-green/10 bg-sunder-green/5 p-6"
                >
                  <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-sunder-green/10">
                    <Check className="h-6 w-6 text-sunder-green" />
                  </div>
                  <h3 className="mt-4 font-semibold text-zinc-900">
                    {benefit.title}
                  </h3>
                  <p className="mt-2 text-sm leading-relaxed text-zinc-600">
                    {benefit.description}
                  </p>
                </div>
              ))}
            </div>
          </Container>
        </section>

        {industry.relatedUseCases.length > 0 && (
          <section className="py-16">
            <Container>
              <div className="mx-auto max-w-2xl text-center">
                <h2 className="font-serif text-3xl font-medium tracking-tight text-zinc-900">
                  Related Solutions
                </h2>
                <p className="mt-4 text-zinc-600">
                  Explore document processing solutions for{" "}
                  {industry.title.toLowerCase()}.
                </p>
              </div>
              <div className="mx-auto mt-12 grid max-w-4xl gap-6 sm:grid-cols-2 lg:grid-cols-3">
                {industry.relatedUseCases.map((caseSlug) => {
                  const useCase = useCases.find((uc) => uc.slug === caseSlug);
                  if (!useCase) return null;
                  const Icon =
                    useCaseIcons[caseSlug as keyof typeof useCaseIcons] ||
                    FileText;
                  return (
                    <Link
                      key={caseSlug}
                      href={`/use-cases/${caseSlug}`}
                      className="group flex items-center gap-4 rounded-xl border border-zinc-200 bg-white p-5 shadow-sm transition-all hover:border-sunder-green hover:shadow-md"
                    >
                      <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-xl bg-sunder-green/10">
                        <Icon className="h-6 w-6 text-sunder-green" />
                      </div>
                      <div>
                        <h3 className="font-semibold text-zinc-900 transition-colors group-hover:text-sunder-green">
                          {useCase.title}
                        </h3>
                        <p className="mt-1 line-clamp-1 text-sm text-zinc-500">
                          {useCase.description}
                        </p>
                      </div>
                    </Link>
                  );
                })}
              </div>
            </Container>
          </section>
        )}

        <section className="bg-zinc-50 py-20">
          <Container>
            <div className="mx-auto max-w-2xl text-center">
              <h2 className="font-serif text-3xl font-medium tracking-tight text-zinc-900">
                Ready to streamline your {industry.title.toLowerCase()} workflow?
              </h2>
              <p className="mt-4 text-zinc-600">
                See Sunder process your actual documents in a free demo.
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
