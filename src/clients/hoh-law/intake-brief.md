# Client Intake Brief: Hoh Law

**Generated:** 2024-12-29
**Source:** Transcript (client intake call, Dec 15 2024)
**Status:** Draft — Pending Clarification

---

## 1. Company Profile & ICP Context

### 1.1 Company Overview

| Field | Value | Source | Confidence |
|-------|-------|--------|------------|
| Company Name | Hoh Law | [T1, Line 6] | ✅ |
| Industry | Legal — Personal Injury | [T1, Line 16] | ✅ |
| Company Size | Boutique firm (implied small) | [T1, Line 16] | ⚠️ |
| Years in Business | 15 years | [T1, Line 16] | ✅ |
| Practice Areas | Motor accident claims, workplace injuries, medical negligence | [T1, Line 16] | ✅ |

### 1.2 Customer Personas

| Name | Role/Title | Decision Authority | Notes |
|------|-----------|-------------------|-------|
| Sarah Chen | Managing Partner | Buyer/Decision Maker | Strategic view, focused on efficiency and visibility |
| David Tan | Senior Paralegal | Champion/End User | Primary user, spends 60-70% time on doc processing |

### 1.3 Buying Triggers & Timeline

**Budget Signals:**
> No explicit budget discussed — [❓ Unknown]

**Timeline/Urgency:**
> "the document volume has gotten completely out of hand" — [T1, Line 17]

> "That fast?" (David, surprised at 2-4 hour setup) — [T1, Line 197]

> "Let's do it. When can we start?" — [T1, Line 199]

**Decision Criteria:**
> "Insurance companies will reject claims if we submit incorrect amounts, wrong dates, or missing provider details... One typo on a $10,000 medical bill costs us weeks of back-and-forth." — Sarah [T1, Lines 32-33]

> "If we can get accuracy up to 95%+, that's a huge win." — David [T1, Line 163]

### 1.4 Pilot Scope (If Discussed)

**Summary:** Initial engagement covers 3 document types with extraction + 1 catch-all, including auto-classification, PDF splitting, validation, and web-based review interface.

**Success Criteria:**
- [ ] 95%+ extraction accuracy — [T1, Line 163] 🎯
- [ ] 70% reduction in manual data entry time (from 60-70% to ~20%) — [T1, Line 161] 🎯
- [ ] Faster claim submission: 2 weeks vs 4-6 weeks — [T1, Line 161] 🎯
- [ ] Dashboard showing case/document status — [T1, Line 165] 🎯

---

## 2. Conversation Breakdown

_Complete end-to-end coverage of all topics discussed. Split into critical and tangential._

### 2A. Critical Business Topics

---

#### 2A.1 Current Pain Points & Workflow

**Summary:** David spends 60-70% of his week on document organization and data entry. Documents arrive chaotically mixed in emails/Dropbox. Manual sorting, renaming, and triple-checking is required. Poor scan quality compounds the problem.

**Source Quotes:**
> "I spend probably 60-70% of my week just organizing documents and entering data into our case management system." — David [T1, Line 18]

> "clients usually dump everything into an email or dropbox - medical bills mixed with discharge summaries mixed with salary slips. It's chaos." — David [T1, Line 30]

> "The real killer is accuracy. Insurance companies will reject claims if we submit incorrect amounts, wrong dates, or missing provider details." — Sarah [T1, Lines 32-33]

> "half the time, the documents are handwritten or poorly scanned. I'm squinting at blurry receipts trying to figure out if that's a 3 or an 8." — David [T1, Line 34]

**Call-outs:** ⚠️ urgent pain, 🎯 accuracy requirement

---

#### 2A.2 Desired Solution / Ideal State

**Summary:** Auto-classification of mixed documents, automatic data extraction, validation/flagging of errors, and a simple review-and-approve workflow.

**Source Quotes:**
> "Upload a pile of mixed documents, and the system automatically figures out what each one is, pulls out the key information we need, and flags anything that looks wrong or unclear. Then we just review and approve." — Sarah [T1, Lines 38-39]

> "We're not technical. It needs to be simple - drag and drop documents, click review, approve, done. If I have to read a manual, it's too complicated." — David [T1, Lines 175-176]

**Call-outs:** 🎯 requirement

---

#### 2A.3 Document Types Overview

**Summary:** Four document categories identified: Medical Expenses, Medical Reports, Income Documents, and Other (catch-all). Each has specific extraction requirements.

**Source Quotes:**
> "Three main types, really: 1. Medical Expenses... 2. Medical Reports... 3. Income Documents..." — David [T1, Lines 46-52]

> "Sometimes we get police reports, witness statements, random cover letters. Those we just want filed away as 'Other' - no need to extract data from them." — Sarah [T1, Lines 56-57]

**Call-outs:** 🎯 requirement

---

#### 2A.4 Medical Expenses — Field Requirements

**Summary:** Critical fields: total amount (SGD, required, must be >0), date (required), provider name (required), invoice/receipt number, GST amount, line items (nice-to-have).

**Source Quotes:**
> "The critical ones are: Total amount - in Singapore dollars. This is non-negotiable... Date - when the bill was issued or treatment received. Also required. Provider name - which hospital, clinic, or pharmacy. Required for insurance validation. Invoice or receipt number - for tracking and audit trails." — David [T1, Lines 64-69]

> "GST amount if it's shown separately. Insurance companies want to see the breakdown." — Sarah [T1, Line 71]

> "If the bill shows itemized charges - like 'consultation $150, X-ray $300' - we want to capture that. But at minimum, we need the total." — David [T1, Line 74]

> "the amount must be positive and greater than zero... we've had cases where scans were so bad the system might read '$1,250' as '$1.25'" — Sarah [T1, Lines 76-77]

> "If the amount, date, or provider is missing, we can't use it. The system should flag it as incomplete... Invoice number is nice to have, but not a dealbreaker." — David [T1, Lines 80-81]

**Call-outs:** 🎯 requirement, ⚠️ validation critical

---

#### 2A.5 Medical Reports — Field Requirements

**Summary:** Patient name (required), diagnosis (required, critical for claims), doctor's name (required), facility name, visit/report date, findings/summary (nice-to-have).

**Source Quotes:**
> "Medical reports are trickier because they're narrative documents, not structured forms. We need: Patient name - to confirm it's the right person. Required. Diagnosis - the primary medical finding or condition. Critical for claims. Doctor's name - who issued the report. Required for credibility. Facility name - which hospital or clinic. Visit or report date - when the examination happened." — David [T1, Lines 88-94]

> "Sometimes we also want the findings or summary - a short extract of what the doctor concluded. But that's more of a 'nice to have' for case review." — Sarah [T1, Lines 95-96]

> "Patient name and diagnosis are absolute must-haves. If either is missing, the document is essentially useless for claims." — Sarah [T1, Lines 99-100]

> "if the confidence is low - like the scan is blurry and the AI isn't sure - we want to know. I'd rather spend 30 seconds verifying a field than submit wrong information" — David [T1, Lines 101-102]

**Call-outs:** 🎯 requirement

---

#### 2A.6 Income Documents — Field Requirements

**Summary:** Employee name (required, must match client), employer name (required), gross salary (required, must be >0), pay period, CPF contributions (employer/employee). Self-employed tax returns classified as "Other" for now.

**Source Quotes:**
> "We're proving loss of income, so we need: Employee name - must match our client. Employer name - which company they work for. Gross salary - monthly or annual gross income in SGD. Pay period - which month/year the salary slip covers. CPF contributions - employer and employee CPF amounts, if shown." — David [T1, Lines 109-114]

> "Gross salary is the big one. If we can't prove their income level, we can't calculate loss of earnings for the claim. So that field is required and must be a positive number." — Sarah [T1, Lines 116-117]

> "For now, let's just handle standard payslips. If we get tax returns or NOAs, we can classify them as 'Other' and I'll review manually. We can always expand later." — Sarah [T1, Lines 120-121]

**Call-outs:** 🎯 requirement

---

#### 2A.7 Document Quality & Edge Cases

**Summary:** 20-30% of documents have quality issues (handwritten, faded, bad angles). System must handle multi-page documents and auto-split mixed PDFs. Low confidence fields should be flagged.

**Source Quotes:**
> "I'd say 20-30% of documents are suboptimal. Handwritten receipts, faded photocopies, photos taken at weird angles. We can't reject them - clients send what they have - but we need the system to flag low confidence so I know to double-check." — David [T1, Lines 128-129]

> "multi-page documents. Sometimes a medical bill is 5 pages... The system needs to understand it's all one document and extract from the right pages." — Sarah [T1, Lines 130-131]

> "Client scans 10 documents into one PDF. We need the system to split them" — David [T1, Line 134]

> "Auto-splitting is a must-have." — Sarah [T1, Line 136]

**Call-outs:** 🎯 requirement, ⚠️ quality concern

---

#### 2A.8 Review Workflow & Validation UI

**Summary:** David wants: (1) clean extracted fields display, (2) clear validation error flags, (3) low confidence warnings. Sarah wants inline correction capability.

**Source Quotes:**
> "I want to see three things: 1. Extracted fields - in a clean table or form, not buried in JSON. 2. Validation errors - if required fields are missing or values don't make sense (like negative amounts), flag them clearly. 3. Low confidence warnings - if the AI isn't sure about a field, highlight it so I can verify against the original document." — David [T1, Lines 144-148]

> "I should be able to correct mistakes inline. If the system reads '$1,250' but I can see it's actually '$1,520', I just type the correction and move on." — Sarah [T1, Line 149]

**Call-outs:** 🎯 requirement

---

#### 2A.9 Success Metrics

**Summary:** Reduce David's doc processing from 60-70% to 20% of time. Claims submitted in 2 weeks (vs 4-6). 95%+ accuracy. Dashboard for case visibility.

**Source Quotes:**
> "David spends 20% of his time on document processing instead of 60-70%. We submit claims faster - maybe within 2 weeks of receiving documents instead of 4-6 weeks." — Sarah [T1, Line 161]

> "And fewer rejections from insurance companies due to data errors. If we can get accuracy up to 95%+, that's a huge win." — David [T1, Line 163]

> "I want visibility. Right now, I have no idea how many documents are pending or which cases are ready to submit. A dashboard showing case status would be amazing." — Sarah [T1, Line 165]

**Call-outs:** 🎯 success criteria

---

#### 2A.10 Technical Requirements & Constraints

**Summary:** Legacy case management system exists but not required for integration. Standalone web app acceptable. Security is critical (encryption, access controls, audit logs). Simple UX required.

**Source Quotes:**
> "We use a legacy case management system, but it's terrible. For now, we're okay with a standalone web app. If it works well, we can look at integrations later." — Sarah [T1, Lines 172-173]

> "We're not technical. It needs to be simple - drag and drop documents, click review, approve, done." — David [T1, Lines 175-176]

> "security is critical. This is confidential medical and financial data. Encryption, access controls, audit logs - all the basics." — Sarah [T1, Line 178]

**Call-outs:** 🎯 requirement

---

#### 2A.11 Next Steps & Action Items

**Summary:** Sunder to send sample document request list. Client to provide 5-10 examples of each doc type by end of week.

**Source Quotes:**
> "I'll send over a sample document request list - we need 5-10 examples of each document type to train the system. Once I have those, we can kick off setup." — You [T1, Lines 201-202]

> "David will get those to you by end of week." — Sarah [T1, Line 204]

**Call-outs:** 🔄 action item

---

### 2B. Tangential Topics

#### 2B.1 Feedback Loop / AI Training

**Summary:** Sarah mentioned corrections feeding back into AI training as "nice to have but not critical for launch."

**Source Quotes:**
> "Should those corrections feed back into training the AI?" — You [T1, Line 151]

> "That would be nice, but not critical for launch. We just need a working system first." — Sarah [T1, Line 153]

---

## 3. SOP-Ready Inputs

### 3.1 Client Config

| Field | Value | Source | Status |
|-------|-------|--------|--------|
| clientId | hoh-law | [T1, Line 6] | ✅ |
| clientName | Hoh Law | [T1, Line 6] | ✅ |

---

### 3.2 Document Types (Tags)

#### Tag: medical_expense

**What this is:** Hospital bills, clinic invoices, pharmacy receipts, and ambulance fees showing amounts the client paid for medical treatment. Captures both total charges and breakdown of payment sources (cash, Medisave, Medishield, insurance, employer schemes).

**Source Quotes:**
> "Medical Expenses - Hospital bills, clinic invoices, pharmacy receipts, ambulance fees. Anything where the client paid for medical treatment." — David [T1, Lines 48-49]

**Classification Hint:**
> Hospital bills, clinic invoices, pharmacy receipts, or ambulance fees showing amounts paid for medical treatment. Look for itemized charges, payment summaries, GST breakdowns, and provider letterhead. Contains terms like 'Invoice', 'Bill', 'Receipt', 'Amount Due', 'Total', 'GST', 'Tax Invoice', 'Final Amount Payable', 'Payment Summary'. Usually has provider logo/letterhead at top, charges in middle, and payment breakdown at bottom.

**TypeScript:**
```typescript
{
  id: "medical_expense",
  displayName: "Medical Expense",
  classificationHint: "Hospital bills, clinic invoices, pharmacy receipts, or ambulance fees showing amounts paid for medical treatment. Look for itemized charges, payment summaries, GST breakdowns, and provider letterhead. Contains terms like 'Invoice', 'Bill', 'Receipt', 'Amount Due', 'Total', 'GST', 'Tax Invoice', 'Final Amount Payable', 'Payment Summary'. Usually has provider logo/letterhead at top, charges in middle, and payment breakdown at bottom.",
  extendProcessorId: null,
}
```

**Extraction Fields:**

| Field | Type | Required | Source | Description |
|-------|------|----------|--------|-------------|
| total_amount_before_deductions | number | Yes | Explicit [T1, Line 65] | Total bill amount before govt subsidy/schemes |
| date | date | Yes | Explicit [T1, Line 66] | Bill/invoice date |
| provider_name | string | Yes | Explicit [T1, Line 67] | Hospital/clinic name |
| invoice_number | string | No | Explicit [T1, Line 68] | Bill reference number |
| cash_amount | number | Yes | User-provided screenshots | Final amount payable by patient |
| medisave_amount | number | No | User-provided screenshots | Amount paid by CPF Medisave |
| medishield_amount | number | No | User-provided screenshots | Amount paid by Medishield Life |
| insurance_amount | number | No | User-provided screenshots | Amount paid by private insurance |
| employer_scheme_amount | number | No | User-provided screenshots | Amount paid by employer/company schemes |

**Validation Rules:**

| Field | Rule | Business Reason |
|-------|------|-----------------|
| total_amount_before_deductions | Required | Can't process bill without total |
| total_amount_before_deductions | Must be > 0 | Sanity check for OCR errors |
| date | Required | Settlement timeline tracking |
| provider_name | Required | Claims must identify provider |
| cash_amount | Required | Need to know patient out-of-pocket |
| cash_amount | Must be >= 0 | Can be zero if fully covered by schemes |

**Validation TypeScript:**
```typescript
validate: (data) => {
  const failures: ValidationFailure[] = [];

  // Required fields
  if (!data.total_amount_before_deductions) {
    failures.push({ ruleId: "total_required", ruleName: "Total amount required", message: "total_amount_before_deductions field is missing" });
  }
  if (!data.date) {
    failures.push({ ruleId: "date_required", ruleName: "Date required", message: "date field is missing" });
  }
  if (!data.provider_name) {
    failures.push({ ruleId: "provider_required", ruleName: "Provider required", message: "provider_name field is missing" });
  }
  if (data.cash_amount === undefined || data.cash_amount === null) {
    failures.push({ ruleId: "cash_required", ruleName: "Cash amount required", message: "cash_amount field is missing" });
  }

  // Sanity checks
  if (typeof data.total_amount_before_deductions === "number" && data.total_amount_before_deductions <= 0) {
    failures.push({ ruleId: "total_positive", ruleName: "Total must be positive", message: "total_amount_before_deductions must be > 0" });
  }
  if (typeof data.cash_amount === "number" && data.cash_amount < 0) {
    failures.push({ ruleId: "cash_non_negative", ruleName: "Cash must be non-negative", message: "cash_amount must be >= 0" });
  }

  return failures;
},
```

**Extend Dashboard Input:**

```text
Document Type:
Singapore hospital bills, clinic invoices, pharmacy receipts showing medical treatment charges with payment breakdown (cash, Medisave, Medishield, insurance, employer schemes)

Requirements:
- total_amount_before_deductions (number, required): The complete bill amount before any government subsidies, Medisave, Medishield, or insurance deductions are applied. This represents the full gross charges for medical services. Found in the payment summary or breakdown section, typically near the bottom of the bill. May be labeled as 'Total Bill', 'Gross Amount', 'Total Charges', 'Amount Before Subsidy', 'Bill Amount', or 'Subtotal'. Usually appears before the deduction breakdown showing various payment sources.

- date (date, required): The date when this bill or invoice was issued. Found near the top of the document in the header section, often close to the invoice number. May be labeled as 'Date', 'Invoice Date', 'Bill Date', 'Issued On', 'Document Date', or appear without explicit label near the header. Format varies: DD/MM/YYYY, DD-MMM-YYYY, or DD MMM YYYY.

- provider_name (string, required): The name of the hospital, clinic, pharmacy, or healthcare facility that provided services and issued this bill. Usually prominently displayed at the top of the document in the letterhead, often accompanied by a logo. May not have an explicit label - typically the most prominent business name on the document.

- invoice_number (string, optional): The unique reference number assigned to this bill for tracking and audit purposes. Found near the top of the document, often close to the date. May be labeled as 'Invoice No', 'Bill No', 'Reference', 'Ref No', 'Document No', 'Receipt No', or similar alphanumeric identifier.

- cash_amount (number, required): The final amount payable by the patient out-of-pocket after all deductions from Medisave, Medishield, insurance, and other schemes have been applied. Found in the payment summary section, typically at the bottom. May be labeled as 'Cash', 'Amount Payable', 'Pay This Amount', 'Net Payable', 'Balance Due', 'Patient Payable', or 'Final Amount Payable'. This is the amount the patient must pay directly.

- medisave_amount (number, optional): The portion of the bill paid using funds from the patient's CPF Medisave Account. This is a Singapore government healthcare savings scheme. Found in payment breakdown section. May be labeled as 'Medisave', 'CPF Medisave', 'MS', 'CPF-MA', 'Medisave Deduction', or 'OA/MA'.

- medishield_amount (number, optional): The portion covered by MediShield Life, Singapore's basic healthcare insurance scheme. Found in payment breakdown section. May be labeled as 'Medishield', 'MediShield Life', 'MSL', 'Medishield Deduction', or 'MSHL'.

- insurance_amount (number, optional): Amount paid by private insurance such as Integrated Shield Plans (IP) or other private health insurance policies. Found in payment breakdown section. May be labeled as 'Insurance', 'IP Rider', 'Private Insurance', 'Insurer Payment', or the specific insurer name (e.g., 'AIA', 'Prudential', 'Great Eastern').

- employer_scheme_amount (number, optional): Amount covered by employer or company healthcare schemes and benefits. Found in payment breakdown section. May be labeled as 'Company Scheme', 'Employer', 'Corporate', 'Company Medical', or specific company/scheme name.
```

---

#### Tag: medical_report

**What this is:** Clinical documents from doctors — discharge summaries, specialist reports, X-ray/MRI findings, medical certificates. Used to establish diagnosis and medical condition for injury claims.

**Source Quotes:**
> "Medical Reports - The clinical stuff. Discharge summaries, specialist reports, X-ray findings, MRI results, medical certificates from doctors." — David [T1, Lines 50-51]

**Classification Hint:**
> Discharge summaries, specialist reports, diagnostic imaging results (X-ray, MRI, CT), medical certificates, or clinical notes from doctors. Look for doctor's letterhead, patient information section, clinical findings, diagnosis, and doctor's signature/stamp. Contains terms like 'Diagnosis', 'Findings', 'Medical Report', 'Discharge Summary', 'Medical Certificate', 'MC', 'Impression', 'Clinical Notes'. Usually narrative format rather than itemized charges.

**TypeScript:**
```typescript
{
  id: "medical_report",
  displayName: "Medical Report",
  classificationHint: "Discharge summaries, specialist reports, diagnostic imaging results (X-ray, MRI, CT), medical certificates, or clinical notes from doctors. Look for doctor's letterhead, patient information section, clinical findings, diagnosis, and doctor's signature/stamp. Contains terms like 'Diagnosis', 'Findings', 'Medical Report', 'Discharge Summary', 'Medical Certificate', 'MC', 'Impression', 'Clinical Notes'. Usually narrative format rather than itemized charges.",
  extendProcessorId: null,
}
```

**Extraction Fields:**

| Field | Type | Required | Source | Description |
|-------|------|----------|--------|-------------|
| patient_name | string | Yes | Explicit [T1, Line 89] | Patient's full name |
| diagnosis | string | No | Explicit [T1, Line 90] | Primary medical finding/condition |
| doctor_name | string | No | Explicit [T1, Line 91] | Name of issuing doctor |
| facility_name | string | No | Explicit [T1, Line 92] | Hospital/clinic name |
| visit_date | date | No | Explicit [T1, Line 93] | Date of examination/visit |
| findings_summary | string | No | Explicit [T1, Lines 95-96] | Short extract of doctor's conclusions |

**Validation Rules:**

| Field | Rule | Business Reason |
|-------|------|-----------------|
| patient_name | Required | Must confirm correct patient |

**Validation TypeScript:**
```typescript
validate: (data) => {
  const failures: ValidationFailure[] = [];

  // Required fields
  if (!data.patient_name) {
    failures.push({ ruleId: "patient_required", ruleName: "Patient name required", message: "patient_name field is missing" });
  }

  return failures;
},
```

**Extend Dashboard Input:**

```text
Document Type:
Medical reports, discharge summaries, specialist reports, diagnostic imaging results (X-ray, MRI, CT), and medical certificates from Singapore healthcare providers

Requirements:
- patient_name (string, required): The full name of the patient who received medical services or examination. Found in the patient information section, typically near the top of the report. May be labeled as 'Patient', 'Patient Name', 'Name', 'Client Name', or appear in a demographic information block.

- diagnosis (string, optional): The primary medical finding, condition, or diagnosis documented in the report. This is the main clinical conclusion. Found in the body of the report, often in a dedicated 'Diagnosis' section or near the conclusion. May be labeled as 'Diagnosis', 'Impression', 'Clinical Diagnosis', 'Final Diagnosis', 'Assessment', or 'Conclusion'.

- doctor_name (string, optional): The name of the physician or specialist who authored or signed the medical report. Found near the signature area, typically at the bottom of the document. May be labeled as 'Doctor', 'Physician', 'Specialist', 'Attending', 'Prepared By', 'Signed By', or appear with credentials (Dr., MBBS, FRCS).

- facility_name (string, optional): The name of the hospital, clinic, or medical facility where the examination or treatment took place. Usually prominently displayed in the letterhead at the top of the document, often with a logo. May not have explicit label - typically the most prominent institution name.

- visit_date (date, optional): The date when the medical examination, consultation, or treatment occurred. Found in the header section or near patient information. May be labeled as 'Date of Visit', 'Examination Date', 'Consultation Date', 'Date', 'Seen On', or 'Report Date'. Format varies: DD/MM/YYYY, DD-MMM-YYYY.

- findings_summary (string, optional): A brief summary or extract of the doctor's clinical findings and conclusions. Found in the body of the report. May be labeled as 'Findings', 'Summary', 'Clinical Findings', 'Report Summary', or appear as the main narrative text of the document.
```

---

#### Tag: income_document

**What this is:** Salary slips, payslips, and gig worker income statements (Grab, foodpanda, freelance platforms) used to prove loss of income for injury claims.

**Source Quotes:**
> "Income Documents - Salary slips, employment contracts, CPF statements. We need these to prove loss of income for claims." — David [T1, Lines 52-53]

**Classification Hint:**
> Salary slips, payslips, CPF statements, or gig platform income statements (Grab, foodpanda, Deliveroo, freelance platforms). Look for employee/worker name, employer/platform name, pay period, gross earnings, and CPF contributions. Contains terms like 'Payslip', 'Salary', 'Pay Statement', 'Earnings', 'Gross Pay', 'CPF', 'Net Pay', 'Pay Period', 'Driver Earnings', 'Trip Summary'. Usually shows breakdown of earnings and deductions.

**TypeScript:**
```typescript
{
  id: "income_document",
  displayName: "Income Document",
  classificationHint: "Salary slips, payslips, CPF statements, or gig platform income statements (Grab, foodpanda, Deliveroo, freelance platforms). Look for employee/worker name, employer/platform name, pay period, gross earnings, and CPF contributions. Contains terms like 'Payslip', 'Salary', 'Pay Statement', 'Earnings', 'Gross Pay', 'CPF', 'Net Pay', 'Pay Period', 'Driver Earnings', 'Trip Summary'. Usually shows breakdown of earnings and deductions.",
  extendProcessorId: null,
}
```

**Extraction Fields:**

| Field | Type | Required | Source | Description |
|-------|------|----------|--------|-------------|
| employee_name | string | Yes | Explicit [T1, Line 110] | Employee/worker name |
| employer_name | string | Yes | Explicit [T1, Line 111] | Employer or platform name |
| gross_salary | number | Yes | Explicit [T1, Line 112] | Gross income before deductions |
| net_salary | number | No | User-requested | Take-home pay after deductions |
| pay_period | string | No | Explicit [T1, Line 113] | Month/year covered |
| cpf_employee | number | No | Explicit [T1, Line 114] | Employee CPF contribution |
| cpf_employer | number | No | Explicit [T1, Line 114] | Employer CPF contribution |

**Validation Rules:**

| Field | Rule | Business Reason |
|-------|------|-----------------|
| — | No validation rules | — |

**Validation TypeScript:**
```typescript
validate: (data) => {
  const failures: ValidationFailure[] = [];
  // No validation rules
  return failures;
},
```

**Extend Dashboard Input:**

```text
Document Type:
Singapore salary slips, payslips, CPF statements, and gig platform income statements (Grab, foodpanda, Deliveroo) showing employee/worker earnings

Requirements:
- employee_name (string, required): The full name of the employee or worker receiving the salary/income. Found in the employee information section, typically near the top of the payslip. May be labeled as 'Employee Name', 'Name', 'Worker', 'Staff Name', 'Payee', or appear in a personal details block.

- employer_name (string, required): The name of the employer, company, or platform issuing the payslip. Usually prominently displayed in the letterhead at the top of the document, often with a company logo. For gig platforms, this would be 'Grab', 'foodpanda', 'Deliveroo', etc. May be labeled as 'Employer', 'Company', or appear without explicit label.

- gross_salary (number, required): The total gross income before any deductions such as CPF, taxes, or other withholdings. Found in the earnings section of the payslip. May be labeled as 'Gross Pay', 'Gross Salary', 'Total Earnings', 'Gross Income', 'Basic + Allowances', or 'Total Gross'. For gig workers, may be labeled as 'Total Earnings', 'Gross Fares', or 'Trip Earnings'.

- net_salary (number, optional): The take-home pay after all deductions have been applied. Found in the summary section, typically highlighted or in larger font. May be labeled as 'Net Pay', 'Net Salary', 'Take Home Pay', 'Amount Payable', 'Net Income', or 'Total Payable'.

- pay_period (string, optional): The time period this payslip covers, typically a month or pay cycle. Found near the top of the document or in the header. May be labeled as 'Pay Period', 'Period', 'Month', 'For the Month of', 'Salary Month', or shown as a date range (e.g., '01 Jan 2024 - 31 Jan 2024').

- cpf_employee (number, optional): The employee's contribution to the Central Provident Fund (CPF), Singapore's mandatory social security savings scheme. Found in the deductions section. May be labeled as 'Employee CPF', 'CPF (Employee)', 'CPF Contribution', 'Member Contribution', or 'CPF Deduction'.

- cpf_employer (number, optional): The employer's contribution to CPF on behalf of the employee. Found in the contributions or employer section. May be labeled as 'Employer CPF', 'CPF (Employer)', 'Company CPF', or 'Employer Contribution'. Sometimes shown separately from employee deductions.
```

---

#### Tag: other

**What this is:** Catch-all for documents that don't fit any defined category.

**Source Quotes:**
> "Sometimes we get police reports, witness statements, random cover letters. Those we just want filed away as 'Other' - no need to extract data from them." — Sarah [T1, Lines 56-57]

**TypeScript:**
```typescript
{
  id: "other",
  displayName: "Other",
  classificationHint: "Documents that don't fit other categories. Police reports, witness statements, cover letters, separator sheets, blank pages, or miscellaneous documents.",
  extendProcessorId: null,
  // No extraction, no validation
}
```

> [!NOTE]
> The "other" tag has no extraction and no validation. It's purely for classification.

---

## 4. Open Questions

> [!IMPORTANT]
> The following items require clarification before finalizing setup

### High Priority (Blocking)

**Q1: Sample documents needed**
- Context: Need 5-10 examples of each document type to train extraction
- **Action:** David to provide by end of week [T1, Line 204]

### Medium Priority

**Q2: Budget/pricing not discussed**
- Context: No pricing or contract terms covered in this call
- **Action:** Follow up on commercial terms

### Low Priority

**Q3: Dashboard requirements**
- Context: Sarah mentioned wanting visibility on case/document status [T1, Line 165]
- **Action:** Scope dashboard features in separate discussion
