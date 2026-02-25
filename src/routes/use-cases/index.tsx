/**
 * Use-cases hub page - lists all document processing use cases.
 * Acts as SEO hub page linking to all spoke pages (invoices, receipts, contracts, forms).
 */
import { createFileRoute, Link } from '@tanstack/react-router'
import { useCases } from '@/data/use-cases'
import { Header } from '@/components/landing/Header'
import { Footer } from '@/components/landing/Footer'
import { Container } from '@/components/landing/Container'
import { ArrowRight, FileText, Receipt, FileCheck, ClipboardList } from 'lucide-react'

/** Icon mapping for each use case slug */
const useCaseIcons = {
  invoices: FileText,
  receipts: Receipt,
  contracts: FileCheck,
  forms: ClipboardList,
} as const

export const Route = createFileRoute('/use-cases/')({
  head: () => ({
    meta: [
      { title: 'Document Processing by Type | Sunder' },
      {
        name: 'description',
        content:
          'Turn invoices, receipts, contracts, and forms into structured Excel data. Upload documents, get clean data back. Built for Singapore SMEs.',
      },
      { property: 'og:title', content: 'Document Processing by Type | Sunder' },
      {
        property: 'og:description',
        content:
          'Turn invoices, receipts, contracts, and forms into structured Excel data. Upload documents, get clean data back. Built for Singapore SMEs.',
      },
      { property: 'og:image', content: 'https://www.trysunder.com/exports/og-image.png' },
      { property: 'og:url', content: 'https://www.trysunder.com/use-cases' },
      { property: 'og:type', content: 'website' },
      { property: 'twitter:card', content: 'summary_large_image' },
      { property: 'twitter:title', content: 'Document Processing by Type | Sunder' },
      {
        property: 'twitter:description',
        content:
          'Turn invoices, receipts, contracts, and forms into structured Excel data. Upload documents, get clean data back. Built for Singapore SMEs.',
      },
      { property: 'twitter:image', content: 'https://www.trysunder.com/exports/og-image.png' },
    ],
    links: [{ rel: 'canonical', href: 'https://www.trysunder.com/use-cases' }],
  }),
  component: UseCasesIndexPage,
})

function UseCasesIndexPage() {
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
        name: 'Use Cases',
        item: 'https://www.trysunder.com/use-cases',
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
                What Documents Do You Need to Process?
              </h1>
              <p className="mt-6 text-lg text-zinc-600 leading-relaxed">
                Invoices, receipts, contracts, or forms. Pick your document type below. Upload files
                to Sunder and get structured data back in Excel format, ready to use.
              </p>
            </div>
          </Container>
        </section>

        {/* Use Cases Grid */}
        <section className="pb-20">
          <Container>
            <div className="mx-auto grid max-w-5xl gap-8 sm:grid-cols-2">
              {useCases.map((useCase) => {
                const Icon = useCaseIcons[useCase.slug as keyof typeof useCaseIcons] || FileText
                return (
                  <Link
                    key={useCase.slug}
                    to="/use-cases/$slug"
                    params={{ slug: useCase.slug }}
                    className="group rounded-2xl border border-zinc-200 bg-white p-8 shadow-sm transition-all hover:border-sunder-green hover:shadow-md"
                  >
                    <div className="flex h-14 w-14 items-center justify-center rounded-xl bg-sunder-green/10">
                      <Icon className="h-7 w-7 text-sunder-green" />
                    </div>
                    <h2 className="mt-6 text-xl font-semibold text-zinc-900 group-hover:text-sunder-green transition-colors">
                      {useCase.title}
                    </h2>
                    <p className="mt-3 text-zinc-600 leading-relaxed">{useCase.description}</p>
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
                Have a Mix of Document Types?
              </h2>
              <p className="mt-4 text-zinc-600">
                Most businesses process invoices, receipts, and contracts together. Book a demo and
                we will show you how Sunder handles all of them in one workflow.
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
