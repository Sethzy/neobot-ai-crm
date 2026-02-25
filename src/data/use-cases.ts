/**
 * Use case landing page content data.
 * Single source of truth for all use case pages - edit content here only.
 */

export interface UseCaseProblem {
  icon: 'alert-triangle' | 'clock' | 'search' | 'file-x' | 'edit' | 'layers'
  title: string
  description: string
}

export interface UseCaseBenefit {
  title: string
  description: string
}

export interface UseCaseStep {
  step: number
  title: string
  description: string
}

export interface UseCase {
  slug: string
  title: string
  /** SEO-optimized title for search intent (used in <title> tag) */
  metaTitle: string
  description: string
  metaDescription: string
  /** Related industry slugs for cross-linking */
  relatedIndustries: string[]
  problems: UseCaseProblem[]
  benefits: UseCaseBenefit[]
  steps: UseCaseStep[]
}

export const useCases: UseCase[] = [
  {
    slug: 'invoices',
    title: 'Invoice Processing',
    metaTitle: 'Invoice Processing Software | Automate AP | Sunder',
    description: 'Turn stacks of supplier invoices into structured Excel data. Sunder reads vendor names, amounts, line items, and due dates from PDFs, scans, and photos.',
    metaDescription: 'Invoice processing software for Singapore SMEs. Extract vendor, amount, and line items from PDFs and scans. Export to Excel or Xero in minutes.',
    relatedIndustries: ['accounting', 'logistics'],
    problems: [
      {
        icon: 'edit',
        title: 'Typing Errors Cost Money',
        description: 'A single wrong digit means paying the wrong amount or the wrong vendor. Staff spend hours double-checking entries they typed by hand.'
      },
      {
        icon: 'clock',
        title: 'Invoices Pile Up at Month-End',
        description: 'When 200 invoices arrive in the last week of the month, your AP team works overtime. Late payments trigger penalty fees and damage supplier trust.'
      },
      {
        icon: 'search',
        title: 'Finding Old Invoices Takes Forever',
        description: 'Auditors ask for invoice #4521 from March. You dig through email, shared drives, and filing cabinets for 30 minutes to find one document.'
      }
    ],
    benefits: [
      {
        title: 'Read Any Invoice Format',
        description: 'PDF attachments, scanned paper, phone photos of thermal prints. Sunder handles invoices in any format without manual templates or setup.'
      },
      {
        title: 'Batch Process 500+ Invoices',
        description: 'Upload a folder of invoices. Get back a single Excel file with vendor, invoice number, date, line items, tax, and total for each one.'
      },
      {
        title: 'Search by Any Field',
        description: 'Type a vendor name, amount, or date range. Find matching invoices in seconds. Every extracted field is indexed and searchable.'
      }
    ],
    steps: [
      {
        step: 1,
        title: 'Upload Your Invoices',
        description: 'Drop PDF files, scanned images, or photos into Sunder. Upload one invoice or an entire month at once.'
      },
      {
        step: 2,
        title: 'Review Extracted Data',
        description: 'See vendor name, invoice number, date, line items, and totals. Click any field to see the source highlighted on the original document.'
      },
      {
        step: 3,
        title: 'Export to Excel or Xero',
        description: 'Download a formatted spreadsheet or push directly to your accounting software. Your data, ready to use.'
      }
    ]
  },
  {
    slug: 'receipts',
    title: 'Receipt Management',
    metaTitle: 'Receipt Scanning & Expense Software | Sunder',
    description: 'Stop losing receipts. Photograph them once, and Sunder pulls out the merchant, amount, date, and GST. Works on faded thermal paper and handwritten notes.',
    metaDescription: 'Receipt scanning software for Singapore businesses. Reads faded thermal prints and handwritten notes. Export expense reports to Excel or Xero.',
    relatedIndustries: ['accounting'],
    problems: [
      {
        icon: 'file-x',
        title: 'Thermal Receipts Fade in Weeks',
        description: 'That taxi receipt from January? Blank by April. IRAS needs supporting documents, but half your receipts are unreadable when tax season hits.'
      },
      {
        icon: 'clock',
        title: 'Expense Claims Sit for Months',
        description: 'Staff shove receipts in wallets and desk drawers. Finance chases them for submissions. Month-end closes drag on because claims are incomplete.'
      },
      {
        icon: 'search',
        title: 'No Receipt, No Reimbursement',
        description: 'Company policy requires receipts. Lost one? Eat the cost. This frustrates employees and creates gaps in your expense records.'
      }
    ],
    benefits: [
      {
        title: 'Reads Faded and Crumpled Paper',
        description: 'Thermal prints, handwritten taxi receipts, coffee-stained lunch bills. If a human can read it, Sunder can extract it.'
      },
      {
        title: 'Groups by Category and Date',
        description: 'Meals, transport, office supplies. Sunder tags each receipt so your expense report is already organized when you export.'
      },
      {
        title: 'One-Click Expense Reports',
        description: 'Select a date range, hit export. Get a formatted spreadsheet with receipt images attached, ready for manager approval.'
      }
    ],
    steps: [
      {
        step: 1,
        title: 'Photograph or Upload',
        description: 'Snap a photo right after a purchase, or upload a batch of receipt images from your camera roll.'
      },
      {
        step: 2,
        title: 'Check the Extracted Data',
        description: 'Sunder shows you merchant name, amount, date, and GST. Tap any field to see it highlighted on the original image.'
      },
      {
        step: 3,
        title: 'Export Your Expense Report',
        description: 'Download as Excel with receipt images, or sync to Xero. Submit to finance and get reimbursed faster.'
      }
    ]
  },
  {
    slug: 'contracts',
    title: 'Contract Analysis',
    metaTitle: 'Contract Data Extraction Software | Sunder',
    description: 'Pull out parties, dates, payment terms, and renewal clauses from signed contracts. Build a searchable archive without reading every page.',
    metaDescription: 'Contract data extraction for Singapore businesses. Extract parties, dates, obligations, and clauses from PDFs. Search across all your contracts.',
    relatedIndustries: ['legal'],
    problems: [
      {
        icon: 'search',
        title: 'Renewal Dates Hide on Page 47',
        description: 'Your vendor contract renews in 30 days with a 60-day notice period. By the time you find the clause, you have missed the window and are locked in for another year.'
      },
      {
        icon: 'clock',
        title: 'Reading Contracts Takes Hours',
        description: 'Procurement asks legal to review a 40-page agreement. Legal skims for red flags but does not have time to extract every date and obligation into a tracker.'
      },
      {
        icon: 'layers',
        title: 'Which Version Was Signed?',
        description: 'There are three versions in email, two in SharePoint, and one on a USB drive. When a dispute arises, finding the executed copy wastes hours.'
      }
    ],
    benefits: [
      {
        title: 'Extract Parties and Dates',
        description: 'Sunder finds contracting parties, effective dates, expiration dates, renewal terms, and notice periods. See them all in a single table.'
      },
      {
        title: 'Track Deadlines in One Place',
        description: 'All your contract renewals and notice periods in one calendar view. Export to Google Calendar or Outlook so nothing slips through.'
      },
      {
        title: 'Search Across All Contracts',
        description: 'Type "indemnification" or "liability cap" and see every clause that matches across your entire contract archive. Click to view the source.'
      }
    ],
    steps: [
      {
        step: 1,
        title: 'Upload Signed Contracts',
        description: 'Drop in PDFs, Word docs, or scanned agreements. Sunder accepts both digital and scanned signatures.'
      },
      {
        step: 2,
        title: 'Review Extracted Terms',
        description: 'See parties, dates, payment terms, and renewal clauses. Click any field to jump to that section in the original document.'
      },
      {
        step: 3,
        title: 'Export or Set Reminders',
        description: 'Download the data to Excel, sync deadlines to your calendar, or search for specific clauses later.'
      }
    ]
  },
  {
    slug: 'forms',
    title: 'Form Processing',
    metaTitle: 'Form Digitization & OCR Software | Sunder',
    description: 'Turn paper forms into spreadsheet rows. Sunder reads printed fields, checkboxes, and handwritten entries from job applications, registration forms, surveys, and customs declarations.',
    metaDescription: 'Form digitization software for Singapore businesses. Extract data from printed and handwritten forms. Job applications, surveys, customs forms to Excel.',
    relatedIndustries: ['accounting', 'legal', 'logistics'],
    problems: [
      {
        icon: 'edit',
        title: 'Handwriting Nobody Can Read',
        description: 'A job applicant scribbles their phone number. Is that a 6 or a 0? Staff spend time squinting at forms and guessing, then calling to confirm.'
      },
      {
        icon: 'layers',
        title: 'Forms Change Every Year',
        description: 'HR updated the leave form. Operations still uses the old version. Now you have two formats to deal with and no single spreadsheet that captures both.'
      },
      {
        icon: 'clock',
        title: '300 Forms in a Box',
        description: 'A trade show ends and your team comes back with stacks of lead capture forms. Typing them into the CRM takes two people three days.'
      }
    ],
    benefits: [
      {
        title: 'Reads Handwriting and Print',
        description: 'Printed fields, handwritten entries, checkboxes, signatures. Sunder extracts them all without needing a perfect scan or a specific form layout.'
      },
      {
        title: 'Flags Unclear Fields',
        description: 'Low confidence on a field? Sunder highlights it for human review instead of guessing. You decide what goes in your database.'
      },
      {
        title: 'Same Output, Any Input',
        description: 'Different form versions, different scanners, different paper sizes. Sunder maps them all to the same column structure in your export.'
      }
    ],
    steps: [
      {
        step: 1,
        title: 'Scan or Photograph Forms',
        description: 'Use a scanner, a phone camera, or a multifunction printer. Upload as PDF, JPEG, or PNG.'
      },
      {
        step: 2,
        title: 'Check Extracted Fields',
        description: 'See each field value with a confidence score. Click to view the source on the original form. Fix any flagged items.'
      },
      {
        step: 3,
        title: 'Export to Excel or Your System',
        description: 'Download as a spreadsheet or push to your CRM, HRIS, or database via CSV or API.'
      }
    ]
  }
]

/**
 * Get a single use case by slug.
 * @param slug - URL slug for the use case (e.g., 'invoices')
 * @returns UseCase object or undefined if not found
 */
export function getUseCase(slug: string): UseCase | undefined {
  return useCases.find(uc => uc.slug === slug)
}

/**
 * Get all valid use case slugs.
 * Useful for sitemap generation and static paths.
 */
export function getUseCaseSlugs(): string[] {
  return useCases.map(uc => uc.slug)
}
