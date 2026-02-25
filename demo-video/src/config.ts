// Configuration types and defaults for NeoBot Demo Video
// All props are JSON-serializable for client customization

export type FileItem = {
    name: string;
    type: 'pdf' | 'image' | 'excel' | 'docx' | 'csv' | 'unknown';
};

export type DemoConfig = {
    client: {
        name: string;
        logoUrl?: string;
    };
    act1: {
        files: FileItem[];
        stat: string;
        statHighlight: string;
    };
    act2: {
        tagline: string;
    };
    act3: {
        uploadTagline: string;
        verifyTagline: string;
    };
    act4: {
        chatPrompt: string;
        chatResponse: string;
        reportTagline: string;
        roiNumbers: {
            documentsPerMonth: number;
            errorRate: number;
            avgOvercharge: number;
        };
    };
    act5: {
        headline: string;
        subheadline: string;
        ctaText: string;
    };
    actDocumentSplit?: {
        categories: {
            hotLeads: { label: string; color: string };
            activeClients: { label: string; color: string };
            followUp: { label: string; color: string };
        };
    };
};

export const defaultConfig: DemoConfig = {
    client: {
        name: "NeoBot",
    },
    act1: {
        files: [
            { name: "WhatsApp Image 2026-01-06 at 2.48 PM.jpeg", type: "image" },
            { name: "Document (1).pdf", type: "pdf" },
            { name: "DRAFT_PO-1009_pending_approval.pdf", type: "pdf" },
            { name: "scan_batch_001.pdf", type: "pdf" },
            { name: "IMG_4521.jpg", type: "image" },
            { name: "invoice_summary_jan.xlsx", type: "excel" },
            { name: "BOL_MAERSK_2026.pdf", type: "pdf" },
            { name: "freight_charges_Q1.xlsx", type: "excel" },
            { name: "photo_2026-01-15.png", type: "image" },
            { name: "carrier_invoice_003.pdf", type: "pdf" },
        ],
        stat: "87% of agents abandon their CRM within 90 days.",
        statHighlight: "Most never open it.",
    },
    act2: {
        tagline: "We set it up. You run it.",
    },
    act3: {
        uploadTagline: "Hand off the docs. We take it from here.",
        verifyTagline: "Trust, but verify. See exactly where it came from.",
    },
    act4: {
        chatPrompt: "Who needs a follow-up this week?",
        chatResponse: "7 contacts need attention. 3 are overdue. Here's your priority list...",
        reportTagline: "Ask anything. About any client. Anytime.",
        roiNumbers: {
            documentsPerMonth: 2,   // repurposed: hrs saved /day
            errorRate: 5,           // repurposed: working days /week
            avgOvercharge: 50,      // repurposed: weeks /year
        },
    },
    act5: {
        headline: "The CRM you'll actually use.",
        subheadline: "Because you never have to open it.",
        ctaText: "Try free for 14 days",
    },
    actDocumentSplit: {
        categories: {
            hotLeads: { label: "HOT LEADS", color: "#EF4444" },
            activeClients: { label: "ACTIVE CLIENTS", color: "#10B981" },
            followUp: { label: "FOLLOW UP", color: "#F59E0B" },
        },
    },
};
