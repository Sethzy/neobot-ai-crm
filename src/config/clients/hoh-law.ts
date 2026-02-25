/**
 * @file Hoh Law client configuration
 * @description Document types and extraction config for Hoh Law.
 *
 * Personal injury law firm requiring document classification and data extraction
 * for medical expenses, medical reports, and income documents.
 *
 * ## Document Types
 * - Medical Expense: Hospital bills, clinic invoices, pharmacy receipts
 * - Medical Report: Discharge summaries, specialist reports, diagnostic results
 * - Income Document: Salary slips, CPF statements, gig platform earnings
 * - Other: Catch-all for unclassifiable documents (no extraction)
 *
 * ## Processor ID Reference
 * | Tag ID          | Processor ID              | ExtendAI Dashboard Link                                       |
 * |-----------------|---------------------------|---------------------------------------------------------------|
 * | medical_expense | dp_CoZLsiI6FOxHC4rNTZHGS  | https://dashboard.extend.ai/processors/dp_CoZLsiI6FOxHC4rNTZHGS |
 * | medical_report  | dp_nZE3Zf4gQPvVbElfcZSfQ  | https://dashboard.extend.ai/processors/dp_nZE3Zf4gQPvVbElfcZSfQ |
 * | income_document | dp_pKFvcN7cRNNDqPQz0X-V3  | https://dashboard.extend.ai/processors/dp_pKFvcN7cRNNDqPQz0X-V3 |
 * | other           | null                      | N/A - no extraction                                           |
 *
 * @see /src/config/types.ts for type definitions
 * @see https://docs.extend.ai/product/extraction/quick-start-5-minutes
 */

import type { ClientConfig, ValidationFailure, TagDefinition } from "../types";

// Import extraction configs from JSON schemas (pulled from ExtendAI Dashboard)
// ESM requires import attributes for JSON files
import medicalExpenseSchema from "../../clients/hoh-law/schemas/medical-expense.json" with { type: "json" };
import medicalReportSchema from "../../clients/hoh-law/schemas/medical-report.json" with { type: "json" };
import incomeDocumentSchema from "../../clients/hoh-law/schemas/income-document.json" with { type: "json" };

/**
 * Helper to cast JSON config to proper extractionConfig type.
 * JSON imports have `type: string` but our interface needs `type: "EXTRACT"` literal.
 */
function asExtractionConfig(config: unknown): TagDefinition["extractionConfig"] {
  return config as TagDefinition["extractionConfig"];
}

/**
 * Hoh Law client configuration.
 * Personal injury practice with medical and income document processing.
 */
export const hohLawConfig: ClientConfig = {
  id: "hoh-law",
  name: "Hoh Law",

  tags: [
    /**
     * Medical Expense documents - hospital bills and clinic invoices.
     * Extraction captures: total_amount_before_deductions, date, provider_name,
     * cash_amount, invoice_number, gst
     */
    {
      id: "medical_expense",
      displayName: "Medical Expense",
      classificationHint:
        "Hospital bills, clinic invoices, pharmacy receipts, or ambulance fees showing amounts paid for medical treatment. Look for itemized charges, payment summaries, GST breakdowns, and provider letterhead. Contains terms like 'Invoice', 'Bill', 'Receipt', 'Amount Due', 'Total', 'GST', 'Tax Invoice', 'Final Amount Payable', 'Payment Summary'. Usually has provider logo/letterhead at top, charges in middle, and payment breakdown at bottom.",
      /** @see https://dashboard.extend.ai/processors/dp_CoZLsiI6FOxHC4rNTZHGS */
      extendProcessorId: "dp_CoZLsiI6FOxHC4rNTZHGS",
      extractionConfig: asExtractionConfig(medicalExpenseSchema.config),
      validate: (data) => {
        const failures: ValidationFailure[] = [];
        if (!data.total_amount_before_deductions) {
          failures.push({
            ruleId: "total_required",
            ruleName: "Total amount required",
            message: "total_amount_before_deductions field is missing",
            description:
              "Insurance companies require the full bill amount (before deductions) to calculate reimbursement. Without this, the claim cannot be processed and will be returned for correction - causing weeks of delay.",
            field: "total_amount_before_deductions",
          });
        }
        if (!data.date) {
          failures.push({
            ruleId: "date_required",
            ruleName: "Date required",
            message: "date field is missing",
            description:
              "The bill date is needed to track settlement timelines and verify the expense occurred after the incident. Missing dates delay claim submission while the team contacts the provider for clarification.",
            field: "date",
          });
        }
        if (!data.provider_name) {
          failures.push({
            ruleId: "provider_required",
            ruleName: "Provider required",
            message: "provider_name field is missing",
            description:
              "Insurance companies require the healthcare provider name to verify the bill is legitimate and treatment was from an approved facility. Without this, the claim will be rejected. Check the bill header or letterhead.",
            field: "provider_name",
          });
        }
        if (data.cash_amount === undefined || data.cash_amount === null) {
          failures.push({
            ruleId: "cash_required",
            ruleName: "Cash amount required",
            message: "cash_amount field is missing",
            description:
              "The patient's out-of-pocket payment is essential for calculating claim damages. This amount represents what the claimant actually paid and directly affects the compensation sought. Check the payment summary section.",
            field: "cash_amount",
          });
        }
        if (
          typeof data.total_amount_before_deductions === "number" &&
          data.total_amount_before_deductions <= 0
        ) {
          failures.push({
            ruleId: "total_positive",
            ruleName: "Total must be positive",
            message: "total_amount_before_deductions must be > 0",
            description:
              "A zero or negative total indicates the system misread the amount from the scanned document. Common OCR errors include reading '$1,250' as '$125' or adding a minus sign. Please compare against the original bill.",
            field: "total_amount_before_deductions",
          });
        }
        if (typeof data.cash_amount === "number" && data.cash_amount < 0) {
          failures.push({
            ruleId: "cash_non_negative",
            ruleName: "Cash must be non-negative",
            message: "cash_amount must be >= 0",
            description:
              "Cash amount can be zero if the bill is fully covered by insurance or government schemes, but negative values indicate a data extraction error. Please verify against the payment breakdown on the original document.",
            field: "cash_amount",
          });
        }
        // Patient ID required for legal case documentation
        if (!data.patient_id_number) {
          failures.push({
            ruleId: "patient_id_required",
            ruleName: "Patient ID required",
            message: "NRIC/FIN is required for legal case documentation",
            description:
              "Patient NRIC/FIN is required to link this medical bill to the correct legal case. Without identity verification, the document cannot be matched to the claimant's records and may be rejected as evidence.",
            field: "patient_id_number",
          });
        }
        // Payer name required for billing verification
        if (!data.payer_name) {
          failures.push({
            ruleId: "payer_required",
            ruleName: "Payer name required",
            message: "Payer information is needed for reimbursement tracking",
            description:
              "Payer name identifies who paid this bill (patient, family member, or third party). This information is needed for reimbursement tracking and to ensure compensation goes to the correct party. Check the billing details section.",
            field: "payer_name",
          });
        }
        // Helper to check if currency field has a valid amount (must be a number)
        const hasAmount = (field: unknown): boolean => {
          if (!field || typeof field !== "object") return false;
          const currency = field as { amount?: number | null };
          return typeof currency.amount === "number";
        };
        // Medisave - flag if not claimed (potential recovery opportunity)
        if (!hasAmount(data.medisave_amount)) {
          failures.push({
            ruleId: "medisave_not_claimed",
            ruleName: "Medisave not claimed",
            message: "No Medisave deduction - verify if patient is eligible",
            description:
              "No Medisave deduction appears on this bill. If the patient is a Singapore citizen or PR with a CPF account, they may be eligible to use Medisave for this expense. Claiming Medisave could significantly reduce out-of-pocket costs.",
            field: "medisave_amount",
          });
        }
        // Insurance - flag if not claimed
        if (!hasAmount(data.insurance_amount)) {
          failures.push({
            ruleId: "insurance_not_claimed",
            ruleName: "Insurance not claimed",
            message: "No insurance deduction - verify coverage status",
            description:
              "No private insurance deduction found. This means either the patient has no coverage, didn't present their insurance card, or the claim hasn't processed yet. Check with the patient about their coverage - unclaimed benefits affect the final damages calculation.",
            field: "insurance_amount",
          });
        }
        // MediShield - flag if not claimed
        if (!hasAmount(data.medishield_amount)) {
          failures.push({
            ruleId: "medishield_not_claimed",
            ruleName: "MediShield not claimed",
            message: "No MediShield Life deduction - verify eligibility",
            description:
              "No MediShield Life deduction on this bill. MediShield Life is mandatory for Singapore citizens and PRs - if this is a hospitalization bill, check if: (1) this is outpatient (MediShield only covers hospitalization), (2) the claim is still processing, or (3) there's an eligibility issue.",
            field: "medishield_amount",
          });
        }
        // Employer scheme - flag if not claimed (relevant for income loss)
        if (!hasAmount(data.employer_scheme_amount)) {
          failures.push({
            ruleId: "employer_scheme_not_claimed",
            ruleName: "Employer scheme not claimed",
            message: "No employer medical scheme deduction - verify employment benefits",
            description:
              "No employer medical scheme deduction found. If the patient is employed, check whether their employer provides medical benefits that could cover this expense. This is also relevant for income loss claims as it indicates employment status.",
            field: "employer_scheme_amount",
          });
        }
        return failures;
      },
    },

    /**
     * Medical Report documents - discharge summaries and specialist reports.
     * Extraction captures: patient_name, diagnosis, findings, doctor_name,
     * report_date, hospital_name
     */
    {
      id: "medical_report",
      displayName: "Medical Report",
      classificationHint:
        "Discharge summaries, specialist reports, diagnostic imaging results (X-ray, MRI, CT), medical certificates, or clinical notes from doctors. Look for doctor's letterhead, patient information section, clinical findings, diagnosis, and doctor's signature/stamp. Contains terms like 'Diagnosis', 'Findings', 'Medical Report', 'Discharge Summary', 'Medical Certificate', 'MC', 'Impression', 'Clinical Notes'. Usually narrative format rather than itemized charges.",
      /** @see https://dashboard.extend.ai/processors/dp_nZE3Zf4gQPvVbElfcZSfQ */
      extendProcessorId: "dp_nZE3Zf4gQPvVbElfcZSfQ",
      extractionConfig: asExtractionConfig(medicalReportSchema.config),
      validate: (data) => {
        const failures: ValidationFailure[] = [];
        if (!data.patient_name) {
          failures.push({
            ruleId: "patient_required",
            ruleName: "Patient name required",
            message: "patient_name field is missing",
            description:
              "Patient identity must be confirmed to link this medical report to the correct legal case. Without a patient name, the document cannot be used as evidence in the claim. Check the report header or patient information section.",
            field: "patient_name",
          });
        }
        // Type of injury must be specific (leg or hand), not "others"
        if (!data["type of injury"] || data["type of injury"] === "others") {
          failures.push({
            ruleId: "injury_type_specific",
            ruleName: "Injury type must be specific",
            message: "Injury type should be 'leg' or 'hand', not 'others' - review for accurate categorization",
            description:
              "Specific injury categorization (leg or hand) is required for accurate claim assessment and damages calculation. 'Others' category requires manual review to determine the correct classification based on the report findings.",
            field: "type of injury",
          });
        }
        // Summary findings should have multiple items for completeness
        const summaryFindings = data.summary_findings as unknown[] | undefined;
        if (!summaryFindings || summaryFindings.length < 3) {
          failures.push({
            ruleId: "summary_incomplete",
            ruleName: "Summary findings incomplete",
            message: "Medical report should have at least 3 summary findings for thorough documentation",
            description:
              "Thorough medical documentation strengthens personal injury claims. Reports with minimal findings may not provide sufficient evidence of injury extent. Review the full report to ensure all relevant findings have been captured.",
            field: "summary_findings",
          });
        }
        // Anatomical findings should be present
        const anatomicalFindings = data.anatomical_findings as unknown[] | undefined;
        if (!anatomicalFindings || anatomicalFindings.length === 0) {
          failures.push({
            ruleId: "anatomical_required",
            ruleName: "Anatomical findings required",
            message: "Medical report should include anatomical findings",
            description:
              "Anatomical findings document the specific body parts and structures affected by the injury. This information is critical for damages calculation and determining long-term impact. Review the clinical findings section of the report.",
            field: "anatomical_findings",
          });
        }
        // Check for serious findings that need attention
        if (anatomicalFindings && Array.isArray(anatomicalFindings)) {
          const hasSerious = anatomicalFindings.some((f) => {
            const finding = f as { "is serious"?: boolean } | null;
            return finding?.["is serious"] === true;
          });
          if (hasSerious) {
            failures.push({
              ruleId: "serious_finding_flagged",
              ruleName: "Serious finding detected",
              message: "Report contains serious findings - requires legal team review",
              description:
                "This medical report contains findings flagged as serious (e.g., permanent injury, significant disability, or life-altering condition). Serious findings typically increase claim value significantly. Please escalate this case to the legal team for review before proceeding.",
              field: "anatomical_findings",
            });
          }
        }
        return failures;
      },
    },

    /**
     * Income Document - salary slips, CPF statements, gig platform earnings.
     * Extraction captures: employee_name, employer_name, gross_earnings,
     * cpf_contribution, net_pay, pay_period
     */
    {
      id: "income_document",
      displayName: "Income Document",
      classificationHint:
        "Salary slips, payslips, CPF statements, or gig platform income statements (Grab, foodpanda, Deliveroo, freelance platforms). Look for employee/worker name, employer/platform name, pay period, gross earnings, and CPF contributions. Contains terms like 'Payslip', 'Salary', 'Pay Statement', 'Earnings', 'Gross Pay', 'CPF', 'Net Pay', 'Pay Period', 'Driver Earnings', 'Trip Summary'. Usually shows breakdown of earnings and deductions.",
      /** @see https://dashboard.extend.ai/processors/dp_pKFvcN7cRNNDqPQz0X-V3 */
      extendProcessorId: "dp_pKFvcN7cRNNDqPQz0X-V3",
      extractionConfig: asExtractionConfig(incomeDocumentSchema.config),
      validate: (_data) => {
        const failures: ValidationFailure[] = [];
        // No validation rules
        return failures;
      },
    },

    /**
     * Other documents - catch-all for unclassifiable documents.
     * No extraction configured.
     */
    {
      id: "other",
      displayName: "Other",
      classificationHint:
        "Documents that don't fit other categories. Police reports, witness statements, cover letters, separator sheets, blank pages, or miscellaneous documents.",
      extendProcessorId: null,
    },
  ],
};
