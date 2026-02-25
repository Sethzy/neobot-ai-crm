/**
 * Industries hub page - lists all industry verticals.
 * Acts as SEO hub page linking to all spoke pages (accounting, legal, logistics).
 */
import { createFileRoute, Link } from '@tanstack/react-router'
import { industries } from '@/data/industries'
import { Header } from '@/components/landing/Header'
import { Footer } from '@/components/landing/Footer'
import { Container } from '@/components/landing/Container'
import { ArrowRight, Calculator, Scale, Truck } from 'lucide-react'

/** Icon mapping for each industry slug */
const industryIcons = {
  accounting: Calculator,
  legal: Scale,
  logistics: Truck,
} as const

export const Route = createFileRoute('/industries/')({
  head: () => ({
    meta: [
      { title: 'Document Processing by Industry | Sunder' },
      {
        name: 'description',
        content:
          'Document processing for accounting firms, law practices, and logistics companies. See how Sunder handles the specific documents your industry deals with.',
      },
      { property: 'og:title', content: 'Document Processing by Industry | Sunder' },
      {
        property: 'og:description',
        content:
          'Document processing for accounting firms, law practices, and logistics companies. See how Sunder handles the specific documents your industry deals with.',
      },
      { property: 'og:image', content: 'https://www.trysunder.com/exports/og-image.png' },
      { property: 'og:url', content: 'https://www.trysunder.com/industries' },
      { property: 'og:type', content: 'website' },
      { property: 'twitter:card', content: 'summary_large_image' },
      { property: 'twitter:title', content: 'Document Processing by Industry | Sunder' },
      {
        property: 'twitter:description',
        content:
          'Document processing for accounting firms, law practices, and logistics companies. See how Sunder handles the specific documents your industry deals with.',
      },
      { property: 'twitter:image', content: 'https://www.trysunder.com/exports/og-image.png' },
    ],
    links: [{ rel: 'canonical', href: 'https://www.trysunder.com/industries' }],
  }),
  component: IndustriesIndexPage,
})

function IndustriesIndexPage() {
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
        name: 'Industries',
        item: 'https://www.trysunder.com/industries',
      },
    ],
  }

  return (
    <div className="landing-page min-h-screen bg-white selection:bg-indigo-100 selection:text-indigo-900">
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
                What Industry Are You In?
              </h1>
              <p className="mt-6 text-lg text-zinc-600 leading-relaxed">
                Accountants process invoices and receipts. Lawyers deal with contracts. Freight
                forwarders handle bills of lading. Pick your industry below to see how Sunder fits
                your workflow.
              </p>
            </div>
          </Container>
        </section>

        {/* Industries Grid */}
        <section className="pb-20">
          <Container>
            <div className="mx-auto grid max-w-5xl gap-8 lg:grid-cols-3">
              {industries.map((industry) => {
                const Icon = industryIcons[industry.slug as keyof typeof industryIcons] || Calculator
                return (
                  <Link
                    key={industry.slug}
                    to="/industries/$slug"
                    params={{ slug: industry.slug }}
                    className="group rounded-2xl border border-zinc-200 bg-white p-8 shadow-sm transition-all hover:border-sunder-green hover:shadow-md"
                  >
                    <div className="flex h-14 w-14 items-center justify-center rounded-xl bg-sunder-green/10">
                      <Icon className="h-7 w-7 text-sunder-green" />
                    </div>
                    <h2 className="mt-6 text-xl font-semibold text-zinc-900 group-hover:text-sunder-green transition-colors">
                      {industry.title}
                    </h2>
                    <p className="mt-3 text-zinc-600 leading-relaxed">{industry.description}</p>
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
                      <ArrowRight className="h-4 w-4 transition-transform group-hover:translate-x-1" />
                    </div>
                  </Link>
                )
              })}
            </div>
          </Container>
        </section>

        {/* CTA Section */}
        <section className="py-20 bg-zinc-50">
          <Container>
            <div className="mx-auto max-w-2xl text-center">
              <h2 className="font-serif text-3xl font-medium tracking-tight text-zinc-900">
                Different Industry?
              </h2>
              <p className="mt-4 text-zinc-600">
                Sunder reads any document with text on it. If your industry is not listed above,
                book a demo and show us what you are working with. We will tell you if we can help.
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
