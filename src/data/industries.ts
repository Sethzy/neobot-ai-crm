/**
 * Industry landing page content data.
 * Single source of truth for all industry vertical pages.
 */

export interface IndustryProblem {
  icon: 'alert-triangle' | 'clock' | 'search' | 'file-x' | 'edit' | 'layers'
  title: string
  description: string
}

export interface IndustryBenefit {
  title: string
  description: string
}

export interface IndustryStep {
  step: number
  title: string
  description: string
}

export interface Industry {
  slug: string
  title: string
  /** SEO-optimized title for search intent (used in <title> tag) */
  metaTitle: string
  headline: string
  description: string
  metaDescription: string
  documentTypes: string[]
  /** Related use case slugs for cross-linking */
  relatedUseCases: string[]
  problems: IndustryProblem[]
  benefits: IndustryBenefit[]
  steps: IndustryStep[]
}

export const industries: Industry[] = [
  {
    slug: 'accounting',
    title: 'Accounting & Bookkeeping',
    metaTitle: 'Document Automation for Accountants | Sunder',
    headline: 'Stop Typing. Start Advising.',
    description: 'Your staff spends hours keying invoices and receipts into Xero. Sunder reads those documents and gives you structured data ready to import. Spend that time on client advisory instead.',
    metaDescription: 'Document processing for accounting firms in Singapore. Extract invoices and receipts to Xero or QuickBooks. Cut data entry time by 80%.',
    documentTypes: ['Invoices', 'Receipts', 'Bank Statements', 'Tax Forms'],
    relatedUseCases: ['invoices', 'receipts', 'forms'],
    problems: [
      {
        icon: 'edit',
        title: 'Junior Staff Stuck on Data Entry',
        description: 'You hired them to learn accounting. Instead, they type invoice data into Xero eight hours a day. Turnover is high because the work is tedious.'
      },
      {
        icon: 'clock',
        title: 'Clients Send Documents on Day 28',
        description: 'Month-end is in three days. Your client just emailed 150 invoices and a shoebox of receipts. Now your team works the weekend to close their books.'
      },
      {
        icon: 'search',
        title: 'Auditors Ask for Invoice #3847',
        description: 'You know you have it somewhere. Twenty minutes later, you find it in a subfolder inside another subfolder. The auditor is still waiting.'
      }
    ],
    benefits: [
      {
        title: 'Export Directly to Xero or QuickBooks',
        description: 'Sunder extracts vendor, amount, date, and GST. Export as a CSV that matches your chart of accounts, ready to import in one click.'
      },
      {
        title: 'Process a Month of Documents in 30 Minutes',
        description: 'Upload all your client invoices and receipts at once. Sunder returns a single file with every transaction extracted and categorized.'
      },
      {
        title: 'Audit Trail Built In',
        description: 'Every extracted field links back to the source document. Show auditors exactly where each number came from.'
      }
    ],
    steps: [
      {
        step: 1,
        title: 'Get Documents from Clients',
        description: 'Clients email PDFs or upload to a shared folder. Collect invoices, receipts, and bank statements in one place.'
      },
      {
        step: 2,
        title: 'Upload to Sunder',
        description: 'Drop the files in. Sunder reads each document and extracts vendor, date, amount, line items, and GST.'
      },
      {
        step: 3,
        title: 'Import to Your Accounting Software',
        description: 'Download the export file. Import to Xero, QuickBooks, or MYOB. Done.'
      }
    ]
  },
  {
    slug: 'legal',
    title: 'Legal & Compliance',
    metaTitle: 'Legal Document Processing Software | Sunder',
    headline: 'Find That Clause in 10 Seconds',
    description: 'Partners ask for the indemnification language from last year. Instead of reading 50 contracts, search across all of them and get the exact paragraph with one query.',
    metaDescription: 'Contract data extraction for Singapore law firms. Extract parties, dates, and clauses. Search across all your contracts. Track renewal deadlines.',
    documentTypes: ['Contracts', 'NDAs', 'Agreements', 'Court Filings'],
    relatedUseCases: ['contracts', 'forms'],
    problems: [
      {
        icon: 'search',
        title: 'Associates Read Contracts All Day',
        description: 'Partner needs the liability cap from a similar deal. An associate spends four hours reading old contracts to find comparable language. That is billable time wasted on admin.'
      },
      {
        icon: 'clock',
        title: 'Renewal Dates Slip Through',
        description: 'A vendor contract renewed because nobody noticed the 60-day notice period buried on page 23. The client is now locked in for another year at the old rates.'
      },
      {
        icon: 'layers',
        title: 'Five Drafts, One Signed Copy',
        description: 'Negotiations went back and forth. Now there are multiple versions in email threads and shared drives. When a dispute arises, finding the executed version takes hours.'
      }
    ],
    benefits: [
      {
        title: 'Pull Out Parties, Dates, and Terms',
        description: 'Sunder reads each contract and extracts contracting parties, effective dates, termination provisions, payment terms, and governing law. See everything in one table.'
      },
      {
        title: 'Set Calendar Reminders for Deadlines',
        description: 'Renewal dates, notice periods, and option exercise windows go straight to your calendar. Get notified 30, 60, or 90 days before each deadline.'
      },
      {
        title: 'Search Clauses Across All Contracts',
        description: 'Type "limitation of liability" and see every matching clause from every contract in your archive. Click to view the source document.'
      }
    ],
    steps: [
      {
        step: 1,
        title: 'Upload Contracts and NDAs',
        description: 'Add executed PDFs or Word documents. Sunder accepts both digital signatures and scanned copies.'
      },
      {
        step: 2,
        title: 'Review Extracted Data',
        description: 'See parties, dates, and key clauses. Click any field to jump to that section in the original document.'
      },
      {
        step: 3,
        title: 'Search and Set Alerts',
        description: 'Query your archive for specific terms. Export deadline dates to Google Calendar or Outlook.'
      }
    ]
  },
  {
    slug: 'logistics',
    title: 'Logistics & Shipping',
    metaTitle: 'Shipping Document Automation | Sunder',
    headline: 'Type Each Container Number Once',
    description: 'Your ops team types the same shipment details into TMS, WMS, and the customs portal. Sunder reads the BL and gives you all the data in one file. Enter it once, push it everywhere.',
    metaDescription: 'Shipping document processing for Singapore freight forwarders. Extract BL, DO, and packing list data. Export to TMS, WMS, or customs systems.',
    documentTypes: ['Bills of Lading', 'Delivery Orders', 'Customs Declarations', 'Packing Lists'],
    relatedUseCases: ['invoices', 'forms'],
    problems: [
      {
        icon: 'edit',
        title: 'Same Data, Three Systems',
        description: 'Ops types container number, weight, and consignee into the TMS. Then again into the WMS. Then again for customs. One typo means a shipment goes to the wrong warehouse.'
      },
      {
        icon: 'clock',
        title: 'Customers Ask Where Is My Shipment',
        description: 'The BL arrived by email but nobody entered it yet. The customer calls for a status update. Your team cannot answer because the data is not in the system.'
      },
      {
        icon: 'file-x',
        title: 'BL Says 500kg, Packing List Says 480kg',
        description: 'Customs flags the discrepancy. The shipment sits in the port while your team scrambles to find the correct figure. Demurrage charges pile up.'
      }
    ],
    benefits: [
      {
        title: 'Read Any Shipping Document',
        description: 'Bills of lading, delivery orders, packing lists, customs declarations. Scanned, emailed as PDF, or photographed at the port. Sunder handles them all.'
      },
      {
        title: 'Spot Mismatches Before Customs Does',
        description: 'Upload the BL and packing list together. Sunder compares weights, quantities, and container numbers. See discrepancies before the shipment clears.'
      },
      {
        title: 'One Export for All Your Systems',
        description: 'Get a structured file with container numbers, HS codes, weights, and consignee details. Import into your TMS, WMS, or customs software.'
      }
    ],
    steps: [
      {
        step: 1,
        title: 'Collect Shipping Documents',
        description: 'BLs from carriers, DOs from agents, packing lists from shippers. Upload them as they arrive.'
      },
      {
        step: 2,
        title: 'Review Extracted Data',
        description: 'See container numbers, weights, HS codes, and consignee info. Click any field to view the source on the original document.'
      },
      {
        step: 3,
        title: 'Export to Your Systems',
        description: 'Download as CSV or Excel. Import into your TMS, WMS, or customs portal. No more triple data entry.'
      }
    ]
  }
]

/**
 * Get a single industry by slug.
 * @param slug - URL slug for the industry (e.g., 'accounting')
 * @returns Industry object or undefined if not found
 */
export function getIndustry(slug: string): Industry | undefined {
  return industries.find(ind => ind.slug === slug)
}

/**
 * Get all valid industry slugs.
 * Useful for sitemap generation and static paths.
 */
export function getIndustrySlugs(): string[] {
  return industries.map(ind => ind.slug)
}
