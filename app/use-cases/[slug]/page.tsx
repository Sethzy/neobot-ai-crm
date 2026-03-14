import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { getUseCase } from "@/data/use-cases";
import { industries } from "@/data/industries";
import { Header } from "@/components/landing/Header";
import { Footer } from "@/components/landing/Footer";
import { Container } from "@/components/landing/Container";
import {
  ArrowRightIcon,
  CalculatorIcon,
  CheckIcon,
  ScaleIcon,
  TruckIcon,
} from "lucide-react";
import { problemIconMap as iconMap } from "@/data/problem-icons";

const industryIcons = {
  accounting: CalculatorIcon,
  legal: ScaleIcon,
  logistics: TruckIcon,
} as const;

export async function generateMetadata({
  params,
}: {
  params: Promise<{ slug: string }>;
}): Promise<Metadata> {
  const { slug } = await params;
  const useCase = getUseCase(slug);
  if (!useCase) return { title: "Not Found | Sunder" };

  const url = `https://www.trysunder.com/use-cases/${useCase.slug}`;
  return {
    title: useCase.metaTitle,
    description: useCase.metaDescription,
    alternates: { canonical: url },
    openGraph: {
      title: useCase.metaTitle,
      description: useCase.metaDescription,
      images: ["https://www.trysunder.com/exports/og-image.png"],
      url,
      type: "website",
    },
    twitter: {
      card: "summary_large_image",
      title: useCase.metaTitle,
      description: useCase.metaDescription,
      images: ["https://www.trysunder.com/exports/og-image.png"],
    },
  };
}

export default async function UseCasePage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  const useCase = getUseCase(slug);
  if (!useCase) notFound();

  const serviceSchema = {
    "@context": "https://schema.org",
    "@type": "Service",
    name: useCase.title,
    description: useCase.metaDescription,
    provider: { "@type": "Organization", name: "Sunder" },
    areaServed: { "@type": "Country", name: "Singapore" },
    serviceType: "Document Processing",
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
        name: useCase.title,
        item: `https://www.trysunder.com/use-cases/${useCase.slug}`,
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
                {useCase.title}
              </h1>
              <p className="mt-6 text-lg leading-relaxed text-zinc-600">
                {useCase.description}
              </p>
              <div className="mt-10">
                <Link
                  href="/login"
                  className="inline-flex items-center gap-2 rounded-full bg-sunder-green px-8 py-4 text-base font-semibold text-white shadow-sm transition-colors hover:bg-sunder-green-dark"
                >
                  Book a Demo
                  <ArrowRightIcon className="h-4 w-4" />
                </Link>
              </div>
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
                Manual document processing creates friction across your
                organization.
              </p>
            </div>
            <div className="mx-auto mt-12 grid max-w-5xl gap-8 sm:grid-cols-3">
              {useCase.problems.map((problem, i) => {
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
                AI-powered extraction that delivers accuracy and speed.
              </p>
            </div>
            <div className="mx-auto mt-12 grid max-w-5xl gap-8 sm:grid-cols-3">
              {useCase.benefits.map((benefit, i) => (
                <div
                  key={i}
                  className="rounded-2xl border border-sunder-green/10 bg-sunder-green/5 p-6"
                >
                  <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-sunder-green/10">
                    <CheckIcon className="h-6 w-6 text-sunder-green" />
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

        {useCase.relatedIndustries.length > 0 && (
          <section className="py-16">
            <Container>
              <div className="mx-auto max-w-2xl text-center">
                <h2 className="font-serif text-3xl font-medium tracking-tight text-zinc-900">
                  Related Industries
                </h2>
                <p className="mt-4 text-zinc-600">
                  See how {useCase.title.toLowerCase()} automation helps these
                  industries.
                </p>
              </div>
              <div className="mx-auto mt-12 grid max-w-4xl gap-6 sm:grid-cols-2 lg:grid-cols-3">
                {useCase.relatedIndustries.map((industrySlug) => {
                  const industry = industries.find(
                    (ind) => ind.slug === industrySlug
                  );
                  if (!industry) return null;
                  const Icon =
                    industryIcons[
                      industrySlug as keyof typeof industryIcons
                    ] || CalculatorIcon;
                  return (
                    <Link
                      key={industrySlug}
                      href={`/industries/${industrySlug}`}
                      className="group flex items-center gap-4 rounded-xl border border-zinc-200 bg-white p-5 shadow-sm transition-all hover:border-sunder-green hover:shadow-md"
                    >
                      <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-xl bg-sunder-green/10">
                        <Icon className="h-6 w-6 text-sunder-green" />
                      </div>
                      <div>
                        <h3 className="font-semibold text-zinc-900 transition-colors group-hover:text-sunder-green">
                          {industry.title}
                        </h3>
                        <p className="mt-1 line-clamp-1 text-sm text-zinc-500">
                          {industry.headline}
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
                Ready to automate your {useCase.title.toLowerCase()}?
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
                  <ArrowRightIcon className="h-4 w-4" />
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
