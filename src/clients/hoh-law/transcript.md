# Hoh Law - Client Intake Call Transcript

**Date:** December 15, 2024
**Duration:** ~15 minutes
**Participants:**
- **Sarah Chen** - Managing Partner, Hoh Law
- **David Tan** - Senior Paralegal, Hoh Law
- **You** - Solutions Consultant, Sunder

---

## Introduction & Background

**You:** Thanks for taking the time today. I understand you're looking for a solution to help with document processing for personal injury claims?

**Sarah:** Yes, exactly. We're a boutique personal injury firm - primarily motor accident claims, workplace injuries, medical negligence. We've been doing this for 15 years, but the document volume has gotten completely out of hand.

**David:** I spend probably 60-70% of my week just organizing documents and entering data into our case management system. We get piles of medical bills, doctor reports, employment letters - all in different formats, often scanned poorly.

**You:** Got it. What's the typical volume we're talking about?

**Sarah:** We handle about 40-50 active cases at any time. Each case involves anywhere from 20 to 200 documents depending on severity. So we're looking at thousands of documents per year.

---

## Current Workflow & Pain Points

**You:** Walk me through what happens when a client sends you documents today.

**David:** Okay, so clients usually dump everything into an email or dropbox - medical bills mixed with discharge summaries mixed with salary slips. It's chaos. First, I have to manually separate them by type. Is this a medical expense? Is this a clinical report? Then I create folders, rename files, and start data entry.

**Sarah:** The real killer is accuracy. Insurance companies will reject claims if we submit incorrect amounts, wrong dates, or missing provider details. So David has to triple-check everything. One typo on a $10,000 medical bill costs us weeks of back-and-forth.

**David:** And half the time, the documents are handwritten or poorly scanned. I'm squinting at blurry receipts trying to figure out if that's a 3 or an 8.

**You:** That sounds painful. What would an ideal system look like for you?

**Sarah:** Upload a pile of mixed documents, and the system automatically figures out what each one is, pulls out the key information we need, and flags anything that looks wrong or unclear. Then we just review and approve.

---

## Document Types

**You:** Let's break down the document types. What are the main categories you deal with?

**David:** Three main types, really:

1. **Medical Expenses** - Hospital bills, clinic invoices, pharmacy receipts, ambulance fees. Anything where the client paid for medical treatment.

2. **Medical Reports** - The clinical stuff. Discharge summaries, specialist reports, X-ray findings, MRI results, medical certificates from doctors.

3. **Income Documents** - Salary slips, employment contracts, CPF statements. We need these to prove loss of income for claims.

**You:** And then miscellaneous stuff that doesn't fit?

**Sarah:** Exactly. Sometimes we get police reports, witness statements, random cover letters. Those we just want filed away as "Other" - no need to extract data from them.

---

## Field Requirements - Medical Expenses

**You:** Let's go document type by type. For medical expenses, what specific data points do you need?

**David:** The critical ones are:
- **Total amount** - in Singapore dollars. This is non-negotiable, we can't submit a claim without it.
- **Date** - when the bill was issued or treatment received. Also required.
- **Provider name** - which hospital, clinic, or pharmacy. Required for insurance validation.
- **Invoice or receipt number** - for tracking and audit trails.

**Sarah:** Oh, and **GST amount** if it's shown separately. Insurance companies want to see the breakdown.

**You:** Are there line items, or just the total?

**David:** Both, ideally. If the bill shows itemized charges - like "consultation $150, X-ray $300" - we want to capture that. But at minimum, we need the total.

**Sarah:** And here's a validation rule - the amount **must be positive and greater than zero**. Sounds obvious, but we've had cases where scans were so bad the system might read "$1,250" as "$1.25" or something. We need a sanity check.

**You:** Got it. What about missing fields - what happens if a receipt doesn't have an invoice number?

**David:** If the amount, date, or provider is missing, we can't use it. The system should flag it as incomplete so I can follow up with the client. Invoice number is nice to have, but not a dealbreaker.

---

## Field Requirements - Medical Reports

**You:** What about medical reports - what data do you extract from those?

**David:** Medical reports are trickier because they're narrative documents, not structured forms. We need:
- **Patient name** - to confirm it's the right person. Required.
- **Diagnosis** - the primary medical finding or condition. Critical for claims.
- **Doctor's name** - who issued the report. Required for credibility.
- **Facility name** - which hospital or clinic.
- **Visit or report date** - when the examination happened.

**Sarah:** Sometimes we also want the **findings or summary** - a short extract of what the doctor concluded. But that's more of a "nice to have" for case review.

**You:** Any validation rules here?

**Sarah:** Patient name and diagnosis are absolute must-haves. If either is missing, the document is essentially useless for claims. We'd need to flag it for manual review.

**David:** Also, if the confidence is low - like the scan is blurry and the AI isn't sure - we want to know. I'd rather spend 30 seconds verifying a field than submit wrong information to the insurance company.

---

## Field Requirements - Income Documents

**You:** Last category - income documents. What are you pulling from those?

**David:** We're proving loss of income, so we need:
- **Employee name** - must match our client.
- **Employer name** - which company they work for.
- **Gross salary** - monthly or annual gross income in SGD.
- **Pay period** - which month/year the salary slip covers.
- **CPF contributions** - employer and employee CPF amounts, if shown.

**Sarah:** Gross salary is the big one. If we can't prove their income level, we can't calculate loss of earnings for the claim. So that field is required and must be a **positive number**.

**You:** What if someone is self-employed and submits tax returns instead of salary slips?

**Sarah:** Good question. For now, let's just handle standard payslips. If we get tax returns or NOAs, we can classify them as "Other" and I'll review manually. We can always expand later.

---

## Edge Cases & Quality Issues

**You:** You mentioned poor scan quality earlier. How often is that an issue?

**David:** I'd say 20-30% of documents are suboptimal. Handwritten receipts, faded photocopies, photos taken at weird angles. We can't reject them - clients send what they have - but we need the system to flag low confidence so I know to double-check.

**Sarah:** Also, multi-page documents. Sometimes a medical bill is 5 pages - cover page, itemized charges, payment terms, disclaimers. The system needs to understand it's all one document and extract from the right pages.

**You:** What about PDFs with multiple document types mixed together?

**David:** Oh, that happens all the time. Client scans 10 documents into one PDF. We need the system to split them - "pages 1-3 are a medical bill, pages 4-6 are a doctor's report, page 7 is a salary slip."

**Sarah:** Exactly. Auto-splitting is a must-have.

---

## Validation & Review Workflow

**You:** Let's talk about the review process. After the system extracts data, what happens?

**David:** I want to see three things:
1. **Extracted fields** - in a clean table or form, not buried in JSON.
2. **Validation errors** - if required fields are missing or values don't make sense (like negative amounts), flag them clearly.
3. **Low confidence warnings** - if the AI isn't sure about a field, highlight it so I can verify against the original document.

**Sarah:** And ideally, I should be able to correct mistakes inline. If the system reads "$1,250" but I can see it's actually "$1,520", I just type the correction and move on.

**You:** Should those corrections feed back into training the AI?

**Sarah:** That would be nice, but not critical for launch. We just need a working system first.

---

## Success Criteria

**You:** If we implement this system, what does success look like 6 months from now?

**Sarah:** David spends 20% of his time on document processing instead of 60-70%. We submit claims faster - maybe within 2 weeks of receiving documents instead of 4-6 weeks.

**David:** And fewer rejections from insurance companies due to data errors. If we can get accuracy up to 95%+, that's a huge win.

**Sarah:** Also, I want visibility. Right now, I have no idea how many documents are pending or which cases are ready to submit. A dashboard showing case status would be amazing.

---

## Technical Requirements

**You:** Last question - any technical constraints? What systems do you currently use?

**Sarah:** We use a legacy case management system, but it's terrible. For now, we're okay with a standalone web app. If it works well, we can look at integrations later.

**David:** We're not technical. It needs to be simple - drag and drop documents, click review, approve, done. If I have to read a manual, it's too complicated.

**Sarah:** And security is critical. This is confidential medical and financial data. Encryption, access controls, audit logs - all the basics.

**You:** Understood. I think we have everything we need to scope this out.

---

## Closing

**Sarah:** So what's the timeline?

**You:** Based on what you've described, we're looking at:
- 3 document types with extraction (Medical Expense, Medical Report, Income Document)
- 1 catch-all type (Other)
- Auto-classification and PDF splitting
- Field validation and confidence scoring
- Web-based review interface

I'd estimate 2-4 hours for initial setup and configuration, then a week for testing and refinement with your real documents.

**David:** That fast?

**You:** The AI does most of the heavy lifting. We'll train it on your sample documents, set up the validation rules, and iterate until accuracy is where you need it.

**Sarah:** Let's do it. When can we start?

**You:** I'll send over a sample document request list - we need 5-10 examples of each document type to train the system. Once I have those, we can kick off setup.

**Sarah:** Perfect. David will get those to you by end of week.

**You:** Great. I'll follow up with next steps. Thanks for your time!

---

## Key Takeaways

**Document Types:**
1. Medical Expense (extract: amount, date, provider, invoice_number, gst, line_items)
2. Medical Report (extract: patient_name, diagnosis, doctor_name, facility, visit_date, findings)
3. Income Document (extract: employee_name, employer, gross_salary, period, cpf_contributions)
4. Other (no extraction)

**Validation Rules:**
- Medical Expense: amount, date, provider are REQUIRED; amount must be > 0
- Medical Report: patient_name and diagnosis are REQUIRED
- Income Document: employee_name, employer, gross_salary are REQUIRED; gross_salary must be > 0

**Quality Requirements:**
- Flag low confidence fields (<85%) for manual review
- Auto-split multi-document PDFs
- Handle poor scan quality gracefully

**Success Metrics:**
- 95%+ extraction accuracy
- 70% reduction in manual data entry time
- Faster claim submission (2 weeks vs 4-6 weeks)
