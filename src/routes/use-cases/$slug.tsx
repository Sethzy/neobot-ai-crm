/**
 * Dynamic use case landing page route.
 * Renders SEO-optimized pages for invoices, receipts, contracts, and forms.
 */
import { createFileRoute, Navigate, Link } from '@tanstack/react-router'
import { notFound } from '@tanstack/react-router'
import { getUseCase } from '@/data/use-cases'
import { industries } from '@/data/industries'
import { Header } from '@/components/landing/Header'
import { Footer } from '@/components/landing/Footer'
import { Container } from '@/components/landing/Container'
import { AlertTriangle, Clock, Search, FileX, Edit, Layers, Check, ArrowRight, Calculator, Scale, Truck } from 'lucide-react'

const iconMap = {
  'alert-triangle': AlertTriangle,
  'clock': Clock,
  'search': Search,
  'file-x': FileX,
  'edit': Edit,
  'layers': Layers,
} as const

/** Icon mapping for industry slugs */
const industryIcons = {
  accounting: Calculator,
  legal: Scale,
  logistics: Truck,
} as const

export const Route = createFileRoute('/use-cases/$slug')({
  loader: ({ params }) => {
    const useCase = getUseCase(params.slug)
    if (!useCase) {
      throw notFound()
    }
    return { useCase }
  },
  head: ({ loaderData }) => {
    if (!loaderData?.useCase) {
      return { meta: [{ title: 'Not Found | Sunder' }] }
    }
    const { useCase } = loaderData
    const url = `https://www.trysunder.com/use-cases/${useCase.slug}`
    return {
      meta: [
        { title: useCase.metaTitle },
        { name: 'description', content: useCase.metaDescription },
        { property: 'og:title', content: useCase.metaTitle },
        { property: 'og:description', content: useCase.metaDescription },
        { property: 'og:image', content: 'https://www.trysunder.com/exports/og-image.png' },
        { property: 'og:url', content: url },
        { property: 'og:type', content: 'website' },
        { property: 'twitter:card', content: 'summary_large_image' },
        { property: 'twitter:title', content: useCase.metaTitle },
        { property: 'twitter:description', content: useCase.metaDescription },
        { property: 'twitter:image', content: 'https://www.trysunder.com/exports/og-image.png' },
      ],
      links: [{ rel: 'canonical', href: url }],
    }
  },
  component: UseCasePage,
  notFoundComponent: () => <Navigate to="/" />,
})

function UseCasePage() {
  const { useCase } = Route.useLoaderData()

  const serviceSchema = {
    '@context': 'https://schema.org',
    '@type': 'Service',
    name: useCase.title,
    description: useCase.metaDescription,
    provider: { '@type': 'Organization', name: 'Sunder' },
    areaServed: { '@type': 'Country', name: 'Singapore' },
    serviceType: 'Document Processing',
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
        name: useCase.title,
        item: `https://www.trysunder.com/use-cases/${useCase.slug}`,
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
                {useCase.title}
              </h1>
              <p className="mt-6 text-lg text-zinc-600 leading-relaxed">
                {useCase.description}
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

        {/* Problem Section */}
        <section className="py-16 bg-zinc-50">
          <Container>
            <div className="mx-auto max-w-2xl text-center">
              <h2 className="font-serif text-3xl font-medium tracking-tight text-zinc-900">
                The Problem
              </h2>
              <p className="mt-4 text-zinc-600">
                Manual document processing creates friction across your organization.
              </p>
            </div>
            <div className="mx-auto mt-12 grid max-w-5xl gap-8 sm:grid-cols-3">
              {useCase.problems.map((problem, i) => {
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
                AI-powered extraction that delivers accuracy and speed.
              </p>
            </div>
            <div className="mx-auto mt-12 grid max-w-5xl gap-8 sm:grid-cols-3">
              {useCase.benefits.map((benefit, i) => (
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
              {useCase.steps.map((step) => (
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

        {/* Related Industries Section */}
        {useCase.relatedIndustries.length > 0 && (
          <section className="py-16">
            <Container>
              <div className="mx-auto max-w-2xl text-center">
                <h2 className="font-serif text-3xl font-medium tracking-tight text-zinc-900">
                  Related Industries
                </h2>
                <p className="mt-4 text-zinc-600">
                  See how {useCase.title.toLowerCase()} automation helps these industries.
                </p>
              </div>
              <div className="mx-auto mt-12 grid max-w-4xl gap-6 sm:grid-cols-2 lg:grid-cols-3">
                {useCase.relatedIndustries.map((slug) => {
                  const industry = industries.find((ind) => ind.slug === slug)
                  if (!industry) return null
                  const Icon = industryIcons[slug as keyof typeof industryIcons] || Calculator
                  return (
                    <Link
                      key={slug}
                      to="/industries/$slug"
                      params={{ slug }}
                      className="group flex items-center gap-4 rounded-xl border border-zinc-200 bg-white p-5 shadow-sm transition-all hover:border-sunder-green hover:shadow-md"
                    >
                      <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-xl bg-sunder-green/10">
                        <Icon className="h-6 w-6 text-sunder-green" />
                      </div>
                      <div>
                        <h3 className="font-semibold text-zinc-900 group-hover:text-sunder-green transition-colors">
                          {industry.title}
                        </h3>
                        <p className="mt-1 text-sm text-zinc-500 line-clamp-1">{industry.headline}</p>
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
                Ready to automate your {useCase.title.toLowerCase()}?
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
