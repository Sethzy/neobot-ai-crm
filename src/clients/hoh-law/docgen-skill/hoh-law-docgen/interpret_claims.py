"""
Personal injury claim interpretation module.
Provides coverage gap analysis, recommendations, and recovery opportunities.
"""

from typing import Any


class ClaimInterpreter:
    """Interpret claim data and identify recovery opportunities."""

    # Thresholds for flagging coverage gaps
    THRESHOLDS = {
        "medisave_cash_threshold": 100,  # Flag missing medisave if cash > this
        "insurance_gross_threshold": 500,  # Flag missing insurance if gross > this
        "medishield_gross_threshold": 2000,  # Flag missing medishield if gross > this (hospitalization)
        "employer_gross_threshold": 500,  # Flag missing employer if gross > this
    }

    # Coverage ratio benchmarks
    COVERAGE_BENCHMARKS = {
        "excellent": 0.80,
        "good": 0.60,
        "acceptable": 0.40,
        "poor": 0.20,
    }

    def __init__(self, case_type: str = "motor_accident"):
        """
        Initialize interpreter with case context.

        Args:
            case_type: Type of personal injury case for context
        """
        self.case_type = case_type
        self.thresholds = self.THRESHOLDS
        self.benchmarks = self.COVERAGE_BENCHMARKS

    def get_amount(self, field: Any) -> float | None:
        """Extract numeric amount from currency field. Returns None if not present."""
        if not field:
            return None
        if isinstance(field, dict):
            amt = field.get("amount")
            if amt is None:
                return None
            return float(amt)
        if isinstance(field, (int, float)):
            return float(field)
        return None

    def has_valid_amount(self, field: Any) -> bool:
        """Check if currency field has a valid non-zero amount."""
        amt = self.get_amount(field)
        return amt is not None and amt > 0

    def analyze_coverage_gaps(self, expenses: list[dict]) -> dict[str, Any]:
        """
        Analyze medical expenses for coverage gaps.

        Args:
            expenses: List of medical expense records

        Returns:
            Dictionary with coverage gaps and recommendations
        """
        missing_medisave = []
        missing_insurance = []
        missing_medishield = []
        missing_employer = []
        data_quality_issues = []
        total_potential_recovery = 0.0

        for expense in expenses:
            split_id = expense.get("split_id") or expense.get("id") or "unknown"
            provider = expense.get("provider_name") or "Unknown Provider"
            gross = self.get_amount(expense.get("total_amount_before_deductions")) or 0
            cash = self.get_amount(expense.get("cash_amount")) or 0

            # Check for missing Medisave
            if not self.has_valid_amount(expense.get("medisave_amount")):
                if cash > self.thresholds["medisave_cash_threshold"]:
                    potential = min(cash * 0.5, 2000)
                    missing_medisave.append({
                        "split_id": split_id,
                        "provider": provider,
                        "gross_amount": gross,
                        "cash_paid": cash,
                        "potential_recovery": potential,
                        "recommendation": "Verify patient CPF eligibility for Medisave claim",
                    })
                    total_potential_recovery += min(cash * 0.3, 1000)

            # Check for missing insurance
            if not self.has_valid_amount(expense.get("insurance_amount")):
                if gross > self.thresholds["insurance_gross_threshold"]:
                    missing_insurance.append({
                        "split_id": split_id,
                        "provider": provider,
                        "gross_amount": gross,
                        "cash_paid": cash,
                        "recommendation": "Check if patient has private insurance coverage",
                    })

            # Check for missing MediShield (typically hospitalization)
            if not self.has_valid_amount(expense.get("medishield_amount")):
                if gross > self.thresholds["medishield_gross_threshold"]:
                    missing_medishield.append({
                        "split_id": split_id,
                        "provider": provider,
                        "gross_amount": gross,
                        "cash_paid": cash,
                        "recommendation": "If hospitalization, verify MediShield Life claim status",
                    })

            # Check for missing employer scheme
            if not self.has_valid_amount(expense.get("employer_scheme_amount")):
                if gross > self.thresholds["employer_gross_threshold"]:
                    missing_employer.append({
                        "split_id": split_id,
                        "provider": provider,
                        "gross_amount": gross,
                        "cash_paid": cash,
                        "recommendation": "Check if patient has employer medical benefits",
                    })

            # Data quality checks
            if not expense.get("date") and not expense.get("document_date"):
                data_quality_issues.append({
                    "split_id": split_id,
                    "provider": provider,
                    "issue": "Missing date",
                    "impact": "Cannot establish treatment timeline",
                })

            if gross > 0 and cash > gross:
                data_quality_issues.append({
                    "split_id": split_id,
                    "provider": provider,
                    "issue": "Cash amount exceeds gross amount",
                    "impact": "Data extraction error - review original document",
                })

        return {
            "coverage_gaps": {
                "missing_medisave": missing_medisave,
                "missing_insurance": missing_insurance,
                "missing_medishield": missing_medishield,
                "missing_employer_scheme": missing_employer,
            },
            "data_quality_issues": data_quality_issues,
            "potential_recovery_estimate": round(total_potential_recovery, 2),
        }

    def interpret_coverage_ratio(self, ratio: float) -> dict[str, Any]:
        """
        Interpret coverage ratio with recommendations.

        Args:
            ratio: Coverage ratio (0-1)

        Returns:
            Dictionary with interpretation
        """
        if ratio >= self.benchmarks["excellent"]:
            rating = "Excellent"
            message = "Strong coverage utilization - most expenses covered by schemes"
            recommendation = "Verify all coverage claims are correctly attributed"
        elif ratio >= self.benchmarks["good"]:
            rating = "Good"
            message = "Above average coverage - some out-of-pocket expenses"
            recommendation = "Review remaining out-of-pocket for potential claims"
        elif ratio >= self.benchmarks["acceptable"]:
            rating = "Acceptable"
            message = "Moderate coverage - significant out-of-pocket component"
            recommendation = "Investigate coverage gaps for recovery opportunities"
        else:
            rating = "Poor"
            message = "Low coverage utilization - high out-of-pocket burden"
            recommendation = "Priority review of all bills for unclaimed benefits"

        return {
            "value": ratio,
            "rating": rating,
            "message": message,
            "recommendation": recommendation,
            "benchmark_comparison": self.benchmarks,
        }

    def interpret_injury_severity(self, injuries: dict[str, Any]) -> dict[str, Any]:
        """
        Interpret injury summary with legal implications.

        Args:
            injuries: Injury summary from calculator

        Returns:
            Dictionary with interpretation
        """
        serious = injuries.get("serious_findings", False)
        injury_count = len(injuries.get("all_injuries", []))
        region_count = len(injuries.get("anatomical_regions", []))

        if serious:
            rating = "Serious"
            message = "Serious injury findings present - elevated general damages expected"
            recommendation = "Escalate to senior legal team for case assessment"
        elif injury_count > 3 or region_count > 2:
            rating = "Moderate"
            message = "Multiple injuries across body regions"
            recommendation = "Document all injuries for comprehensive claim"
        elif injury_count > 0:
            rating = "Minor"
            message = "Limited injuries documented"
            recommendation = "Ensure all medical reports captured for complete picture"
        else:
            rating = "Unknown"
            message = "No injury data available"
            recommendation = "Obtain medical reports to document injuries"

        return {
            "rating": rating,
            "message": message,
            "recommendation": recommendation,
            "injury_count": injury_count,
            "region_count": region_count,
            "requires_escalation": serious,
        }

    def generate_action_items(
        self,
        coverage_gaps: dict[str, Any],
        coverage_ratio: float,
        injuries: dict[str, Any],
    ) -> list[dict[str, Any]]:
        """
        Generate prioritized action items based on analysis.

        Args:
            coverage_gaps: Coverage gap analysis results
            coverage_ratio: Overall coverage ratio
            injuries: Injury summary

        Returns:
            List of prioritized action items
        """
        actions = []

        # Coverage gap actions
        gaps = coverage_gaps.get("coverage_gaps", {})

        missing_medisave = gaps.get("missing_medisave", [])
        if missing_medisave:
            total = sum(item.get("potential_recovery", 0) for item in missing_medisave)
            actions.append({
                "priority": "HIGH" if total > 1000 else "MEDIUM",
                "category": "Coverage Recovery",
                "action": f"Review {len(missing_medisave)} bills for potential Medisave claims",
                "potential_value": round(total, 2),
                "details": f"Patient may be eligible for CPF Medisave on {len(missing_medisave)} bills",
            })

        missing_insurance = gaps.get("missing_insurance", [])
        if missing_insurance:
            actions.append({
                "priority": "MEDIUM",
                "category": "Coverage Verification",
                "action": f"Verify insurance coverage for {len(missing_insurance)} bills",
                "potential_value": None,
                "details": "Check if patient has private health insurance that could cover these expenses",
            })

        missing_medishield = gaps.get("missing_medishield", [])
        if missing_medishield:
            actions.append({
                "priority": "MEDIUM",
                "category": "Coverage Recovery",
                "action": f"Check MediShield Life status for {len(missing_medishield)} hospitalization bills",
                "potential_value": None,
                "details": "MediShield Life is mandatory for citizens/PRs - verify claim status",
            })

        # Data quality actions
        data_issues = coverage_gaps.get("data_quality_issues", [])
        critical_issues = [i for i in data_issues if "Missing" in i.get("issue", "")]
        if critical_issues:
            actions.append({
                "priority": "HIGH",
                "category": "Data Quality",
                "action": f"Resolve {len(critical_issues)} data extraction issues",
                "potential_value": None,
                "details": "Missing required fields may delay claim processing",
            })

        # Injury escalation
        if injuries.get("serious_findings") or injuries.get("requires_escalation"):
            actions.append({
                "priority": "HIGH",
                "category": "Case Escalation",
                "action": "Escalate to senior legal team",
                "potential_value": None,
                "details": "Serious injury findings require specialized case handling",
            })

        # Coverage ratio action
        if coverage_ratio < self.benchmarks["acceptable"]:
            actions.append({
                "priority": "MEDIUM",
                "category": "Coverage Review",
                "action": "Comprehensive coverage review recommended",
                "potential_value": None,
                "details": f"Coverage ratio of {coverage_ratio * 100:.0f}% is below acceptable threshold",
            })

        # Sort by priority
        priority_order = {"HIGH": 0, "MEDIUM": 1, "LOW": 2}
        actions.sort(key=lambda x: priority_order.get(x.get("priority", "LOW"), 2))

        return actions

    def generate_report(self, analysis: dict[str, Any]) -> str:
        """
        Generate a comprehensive interpretation report.

        Args:
            analysis: Complete analysis results

        Returns:
            Formatted report string
        """
        report_lines = [
            f"Personal Injury Claim Analysis Report - {self.case_type.replace('_', ' ').title()}",
            "=" * 70,
            "",
        ]

        # Summary section
        summary = analysis.get("summary", {})
        report_lines.append("CLAIM SUMMARY")
        report_lines.append("-" * 40)
        report_lines.append(f"Total Claim Amount: ${summary.get('total_claim_amount', 0):,.2f}")
        report_lines.append(f"Out-of-Pocket: ${summary.get('total_out_of_pocket', 0):,.2f}")
        report_lines.append(f"Coverage Ratio: {summary.get('coverage_ratio', 0) * 100:.1f}%")
        report_lines.append("")

        # Coverage interpretation
        coverage_interp = analysis.get("coverage_interpretation", {})
        if coverage_interp:
            report_lines.append("COVERAGE ASSESSMENT")
            report_lines.append("-" * 40)
            report_lines.append(f"Rating: {coverage_interp.get('rating', 'N/A')}")
            report_lines.append(f"Analysis: {coverage_interp.get('message', '')}")
            report_lines.append(f"Action: {coverage_interp.get('recommendation', '')}")
            report_lines.append("")

        # Injury assessment
        injury_interp = analysis.get("injury_interpretation", {})
        if injury_interp:
            report_lines.append("INJURY ASSESSMENT")
            report_lines.append("-" * 40)
            report_lines.append(f"Severity: {injury_interp.get('rating', 'N/A')}")
            report_lines.append(f"Analysis: {injury_interp.get('message', '')}")
            report_lines.append(f"Action: {injury_interp.get('recommendation', '')}")
            report_lines.append("")

        # Action items
        actions = analysis.get("action_items", [])
        if actions:
            report_lines.append("ACTION ITEMS")
            report_lines.append("-" * 40)
            for i, action in enumerate(actions, 1):
                report_lines.append(f"{i}. [{action.get('priority')}] {action.get('action')}")
                if action.get("potential_value"):
                    report_lines.append(f"   Potential Value: ${action['potential_value']:,.2f}")
                report_lines.append(f"   Details: {action.get('details', '')}")
            report_lines.append("")

        return "\n".join(report_lines)


def perform_comprehensive_analysis(
    document_data: dict[str, Any],
    case_type: str = "motor_accident",
) -> dict[str, Any]:
    """
    Perform comprehensive claim analysis with interpretations.

    Args:
        document_data: Extracted document data
        case_type: Type of personal injury case

    Returns:
        Complete analysis with interpretations and recommendations
    """
    from calculate_claims import calculate_claims_from_data

    interpreter = ClaimInterpreter(case_type)

    # Get calculated metrics
    calculated = calculate_claims_from_data(document_data)
    details = calculated.get("details", {})

    # Analyze coverage gaps
    expenses = [s for s in document_data.get("splits", []) if s.get("tag_id") == "medical_expense"]
    coverage_gaps = interpreter.analyze_coverage_gaps(expenses)

    # Interpret coverage ratio
    coverage_ratio = details.get("expenses", {}).get("coverage_ratio", 0)
    coverage_interpretation = interpreter.interpret_coverage_ratio(coverage_ratio)

    # Interpret injuries
    injuries = details.get("injuries", {})
    injury_interpretation = interpreter.interpret_injury_severity(injuries)

    # Generate action items
    action_items = interpreter.generate_action_items(
        coverage_gaps,
        coverage_ratio,
        injuries,
    )

    analysis = {
        "summary": calculated.get("summary", {}),
        "formatted": calculated.get("formatted", {}),
        "details": details,
        "coverage_gaps": coverage_gaps,
        "coverage_interpretation": coverage_interpretation,
        "injury_interpretation": injury_interpretation,
        "action_items": action_items,
        "recommendations": [a["action"] for a in action_items[:5]],
    }

    # Add formatted report
    analysis["report"] = interpreter.generate_report(analysis)

    return analysis


# Example usage
if __name__ == "__main__":
    import json

    # Sample document data
    sample_data = {
        "splits": [
            {
                "tag_id": "medical_expense",
                "provider_name": "Singapore General Hospital",
                "document_date": "2024-01-15",
                "total_amount_before_deductions": {"amount": 5000, "iso_4217_currency_code": "SGD"},
                "cash_amount": {"amount": 2500, "iso_4217_currency_code": "SGD"},
                "medisave_amount": {"amount": 2000, "iso_4217_currency_code": "SGD"},
            },
            {
                "tag_id": "medical_expense",
                "provider_name": "Mt Elizabeth Hospital",
                "document_date": "2024-02-20",
                "total_amount_before_deductions": {"amount": 8000, "iso_4217_currency_code": "SGD"},
                "cash_amount": {"amount": 5000, "iso_4217_currency_code": "SGD"},
            },
            {
                "tag_id": "medical_report",
                "type of injury": "leg",
                "list of all injuries mentioned": ["ACL tear", "meniscus damage"],
                "anatomical_findings": [
                    {"region": "knee", "is serious": True},
                ],
            },
        ]
    }

    results = perform_comprehensive_analysis(sample_data)
    print(results["report"])
    print("\n" + "=" * 60)
    print("JSON OUTPUT:")
    print(json.dumps({k: v for k, v in results.items() if k != "report"}, indent=2))
