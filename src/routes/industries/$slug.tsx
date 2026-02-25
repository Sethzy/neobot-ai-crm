/**
 * Dynamic industry landing page route.
 * Renders SEO-optimized pages for accounting, legal, and logistics verticals.
 */
import { createFileRoute, Navigate, Link } from '@tanstack/react-router'
import { notFound } from '@tanstack/react-router'
import { getIndustry } from '@/data/industries'
import { useCases } from '@/data/use-cases'
import { Header } from '@/components/landing/Header'
import { Footer } from '@/components/landing/Footer'
import { Container } from '@/components/landing/Container'
import { AlertTriangle, Clock, Search, FileX, Edit, Layers, Check, ArrowRight, FileText, Receipt, FileCheck, ClipboardList } from 'lucide-react'

const iconMap = {
  'alert-triangle': AlertTriangle,
  'clock': Clock,
  'search': Search,
  'file-x': FileX,
  'edit': Edit,
  'layers': Layers,
} as const

/** Icon mapping for use case slugs */
const useCaseIcons = {
  invoices: FileText,
  receipts: Receipt,
  contracts: FileCheck,
  forms: ClipboardList,
} as const

export const Route = createFileRoute('/industries/$slug')({
  loader: ({ params }) => {
    const industry = getIndustry(params.slug)
    if (!industry) {
      throw notFound()
    }
    return { industry }
  },
  head: ({ loaderData }) => {
    if (!loaderData?.industry) {
      return { meta: [{ title: 'Not Found | Sunder' }] }
    }
    const { industry } = loaderData
    const url = `https://www.trysunder.com/industries/${industry.slug}`
    return {
      meta: [
        { title: industry.metaTitle },
        { name: 'description', content: industry.metaDescription },
        { property: 'og:title', content: industry.metaTitle },
        { property: 'og:description', content: industry.metaDescription },
        { property: 'og:image', content: 'https://www.trysunder.com/exports/og-image.png' },
        { property: 'og:url', content: url },
        { property: 'og:type', content: 'website' },
        { property: 'twitter:card', content: 'summary_large_image' },
        { property: 'twitter:title', content: industry.metaTitle },
        { property: 'twitter:description', content: industry.metaDescription },
        { property: 'twitter:image', content: 'https://www.trysunder.com/exports/og-image.png' },
      ],
      links: [{ rel: 'canonical', href: url }],
    }
  },
  component: IndustryPage,
  notFoundComponent: () => <Navigate to="/" />,
})

function IndustryPage() {
  const { industry } = Route.useLoaderData()

  const serviceSchema = {
    '@context': 'https://schema.org',
    '@type': 'Service',
    name: `${industry.title} Document Processing`,
    description: industry.metaDescription,
    provider: { '@type': 'Organization', name: 'Sunder' },
    areaServed: { '@type': 'Country', name: 'Singapore' },
    serviceType: industry.title,
  }

  const breadcrumbSchema = {
    '@context': 'https://schema.org',
    '@type': 'BreadcrumbList',
    itemListElement: [
      {
        '@type': 'ListItem',
        position: 1,
        name: 'Home',
        item: 'https://www.trysunder.com',
      },
      {
        '@type': 'ListItem',
        position: 2,
        name: industry.title,
        item: `https://www.trysunder.com/industries/${industry.slug}`,
      },
    ],
  }

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
        {/* Hero Section */}
        <section className="py-20 sm:py-28">
          <Container>
            <div className="mx-auto max-w-3xl text-center">
              <h1 className="font-serif text-4xl font-medium tracking-tight text-zinc-900 sm:text-5xl">
                {industry.headline}
              </h1>
              <p className="mt-6 text-lg text-zinc-600 leading-relaxed">
                {industry.description}
              </p>
              <div className="mt-10">
                <Link
                  to="/demo"
                  className="inline-flex items-center gap-2 rounded-full bg-sunder-green px-8 py-4 text-base font-semibold text-white shadow-sm hover:bg-sunder-green-dark transition-colors"
                >
                  Book a Demo
                  <ArrowRight className="h-4 w-4" />
                </Link>
              </div>
            </div>
          </Container>
        </section>

        {/* Documents We Process Section */}
        <section className="py-16 bg-sunder-green/5">
          <Container>
            <div className="mx-auto max-w-2xl text-center">
              <h2 className="font-serif text-3xl font-medium tracking-tight text-zinc-900">
                Documents We Process
              </h2>
              <p className="mt-4 text-zinc-600">
                Sunder handles the documents that matter most to your {industry.title.toLowerCase()} workflow.
              </p>
            </div>
            <div className="mx-auto mt-12 flex flex-wrap justify-center gap-4 max-w-3xl">
              {industry.documentTypes.map((docType, i) => (
                <div
                  key={i}
                  className="flex items-center gap-2 rounded-full bg-white px-5 py-3 shadow-sm border border-zinc-100"
                >
                  <FileText className="h-5 w-5 text-sunder-green" />
                  <span className="font-medium text-zinc-900">{docType}</span>
                </div>
              ))}
            </div>
          </Container>
        </section>

        {/* Problem Section */}
        <section className="py-16 bg-zinc-50">
          <Container>
            <div className="mx-auto max-w-2xl text-center">
              <h2 className="font-serif text-3xl font-medium tracking-tight text-zinc-900">
                The Problem
              </h2>
              <p className="mt-4 text-zinc-600">
                Manual document processing creates friction in {industry.title.toLowerCase()} operations.
              </p>
            </div>
            <div className="mx-auto mt-12 grid max-w-5xl gap-8 sm:grid-cols-3">
              {industry.problems.map((problem, i) => {
                const Icon = iconMap[problem.icon]
                return (
                  <div key={i} className="rounded-2xl bg-white p-6 shadow-sm border border-zinc-100">
                    <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-red-50">
                      <Icon className="h-6 w-6 text-red-600" />
                    </div>
                    <h3 className="mt-4 font-semibold text-zinc-900">{problem.title}</h3>
                    <p className="mt-2 text-sm text-zinc-600 leading-relaxed">{problem.description}</p>
                  </div>
                )
              })}
            </div>
          </Container>
        </section>

        {/* Solution Section */}
        <section className="py-16">
          <Container>
            <div className="mx-auto max-w-2xl text-center">
              <h2 className="font-serif text-3xl font-medium tracking-tight text-zinc-900">
                The Sunder Solution
              </h2>
              <p className="mt-4 text-zinc-600">
                AI-powered extraction built for {industry.title.toLowerCase()} workflows.
              </p>
            </div>
            <div className="mx-auto mt-12 grid max-w-5xl gap-8 sm:grid-cols-3">
              {industry.benefits.map((benefit, i) => (
                <div key={i} className="rounded-2xl bg-sunder-green/5 p-6 border border-sunder-green/10">
                  <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-sunder-green/10">
                    <Check className="h-6 w-6 text-sunder-green" />
                  </div>
                  <h3 className="mt-4 font-semibold text-zinc-900">{benefit.title}</h3>
                  <p className="mt-2 text-sm text-zinc-600 leading-relaxed">{benefit.description}</p>
                </div>
              ))}
            </div>
          </Container>
        </section>

        {/* How It Works Section */}
        <section className="py-16 bg-zinc-50">
          <Container>
            <div className="mx-auto max-w-2xl text-center">
              <h2 className="font-serif text-3xl font-medium tracking-tight text-zinc-900">
                How It Works
              </h2>
              <p className="mt-4 text-zinc-600">
                Three simple steps to automate your document workflow.
              </p>
            </div>
            <div className="mx-auto mt-12 grid max-w-4xl gap-8 sm:grid-cols-3">
              {industry.steps.map((step) => (
                <div key={step.step} className="text-center">
                  <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-full bg-sunder-green text-xl font-bold text-white">
                    {step.step}
                  </div>
                  <h3 className="mt-4 font-semibold text-zinc-900">{step.title}</h3>
                  <p className="mt-2 text-sm text-zinc-600 leading-relaxed">{step.description}</p>
                </div>
              ))}
            </div>
          </Container>
        </section>

        {/* Related Use Cases Section */}
        {industry.relatedUseCases.length > 0 && (
          <section className="py-16">
            <Container>
              <div className="mx-auto max-w-2xl text-center">
                <h2 className="font-serif text-3xl font-medium tracking-tight text-zinc-900">
                  Related Solutions
                </h2>
                <p className="mt-4 text-zinc-600">
                  Explore document processing solutions for {industry.title.toLowerCase()}.
                </p>
              </div>
              <div className="mx-auto mt-12 grid max-w-4xl gap-6 sm:grid-cols-2 lg:grid-cols-3">
                {industry.relatedUseCases.map((slug) => {
                  const useCase = useCases.find((uc) => uc.slug === slug)
                  if (!useCase) return null
                  const Icon = useCaseIcons[slug as keyof typeof useCaseIcons] || FileText
                  return (
                    <Link
                      key={slug}
                      to="/use-cases/$slug"
                      params={{ slug }}
                      className="group flex items-center gap-4 rounded-xl border border-zinc-200 bg-white p-5 shadow-sm transition-all hover:border-sunder-green hover:shadow-md"
                    >
                      <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-xl bg-sunder-green/10">
                        <Icon className="h-6 w-6 text-sunder-green" />
                      </div>
                      <div>
                        <h3 className="font-semibold text-zinc-900 group-hover:text-sunder-green transition-colors">
                          {useCase.title}
                        </h3>
                        <p className="mt-1 text-sm text-zinc-500 line-clamp-1">{useCase.description}</p>
                      </div>
                    </Link>
                  )
                })}
              </div>
            </Container>
          </section>
        )}

        {/* CTA Section */}
        <section className="py-20 bg-zinc-50">
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
                  to="/demo"
                  className="inline-flex items-center gap-2 rounded-full bg-sunder-green px-8 py-4 text-base font-semibold text-white shadow-sm hover:bg-sunder-green-dark transition-colors"
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
  )
}
