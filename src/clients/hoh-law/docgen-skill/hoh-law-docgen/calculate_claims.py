"""
Personal injury claim calculation module.
Provides functions to calculate claim totals, coverage ratios, and summaries.
"""

import json
from typing import Any
from collections import defaultdict


class ClaimCalculator:
    """Calculate claim totals from extracted document data."""

    def __init__(self, document_data: dict[str, Any]):
        """
        Initialize with extracted document data.

        Args:
            document_data: Dictionary containing splits array with medical_expense,
                          medical_report, and income_document records
        """
        self.splits = document_data.get("splits", [])
        self.expenses = [s for s in self.splits if s.get("tag_id") == "medical_expense"]
        self.reports = [s for s in self.splits if s.get("tag_id") == "medical_report"]
        self.income_docs = [s for s in self.splits if s.get("tag_id") == "income_document"]

    def get_amount(self, field: Any) -> float:
        """Extract numeric amount from currency field."""
        if not field:
            return 0.0
        if isinstance(field, dict):
            return float(field.get("amount") or 0)
        if isinstance(field, (int, float)):
            return float(field)
        return 0.0

    def safe_divide(self, numerator: float, denominator: float, default: float = 0.0) -> float:
        """Safely divide two numbers, returning default if denominator is zero."""
        if denominator == 0:
            return default
        return numerator / denominator

    def calculate_expense_totals(self) -> dict[str, Any]:
        """Calculate total medical expenses and breakdowns."""
        totals = {
            "gross": 0.0,
            "cash": 0.0,
            "medisave": 0.0,
            "medishield": 0.0,
            "insurance": 0.0,
            "employer": 0.0,
        }

        by_provider = defaultdict(lambda: {"gross": 0.0, "out_of_pocket": 0.0, "count": 0})
        by_month = defaultdict(lambda: {"gross": 0.0, "out_of_pocket": 0.0, "count": 0})

        for expense in self.expenses:
            gross = self.get_amount(expense.get("total_amount_before_deductions"))
            cash = self.get_amount(expense.get("cash_amount"))
            medisave = self.get_amount(expense.get("medisave_amount"))
            medishield = self.get_amount(expense.get("medishield_amount"))
            insurance = self.get_amount(expense.get("insurance_amount"))
            employer = self.get_amount(expense.get("employer_scheme_amount"))

            totals["gross"] += gross
            totals["cash"] += cash
            totals["medisave"] += medisave
            totals["medishield"] += medishield
            totals["insurance"] += insurance
            totals["employer"] += employer

            # By provider
            provider = expense.get("provider_name") or "Unknown"
            by_provider[provider]["gross"] += gross
            by_provider[provider]["out_of_pocket"] += cash
            by_provider[provider]["count"] += 1

            # By month
            doc_date = expense.get("document_date") or expense.get("date")
            if doc_date:
                month = doc_date[:7]
                by_month[month]["gross"] += gross
                by_month[month]["out_of_pocket"] += cash
                by_month[month]["count"] += 1

        total_covered = totals["medisave"] + totals["medishield"] + totals["insurance"] + totals["employer"]
        coverage_ratio = self.safe_divide(total_covered, totals["gross"])

        return {
            "total_gross": round(totals["gross"], 2),
            "total_out_of_pocket": round(totals["cash"], 2),
            "total_covered": round(total_covered, 2),
            "coverage_ratio": round(coverage_ratio, 3),
            "document_count": len(self.expenses),
            "by_provider": sorted(
                [{"provider": k, **v} for k, v in by_provider.items()],
                key=lambda x: x["gross"],
                reverse=True
            ),
            "by_payment_source": {k: round(v, 2) for k, v in totals.items() if k != "gross"},
            "by_month": sorted(
                [{"month": k, **v} for k, v in by_month.items()],
                key=lambda x: x["month"]
            ),
        }

    def calculate_income_summary(self) -> dict[str, Any]:
        """Calculate income summary from income documents."""
        if not self.income_docs:
            return {
                "document_count": 0,
                "total_gross_income": 0,
                "total_net_income": 0,
                "average_monthly_gross": 0,
                "average_monthly_net": 0,
                "employers": [],
            }

        total_gross = 0.0
        total_net = 0.0
        by_employer = defaultdict(lambda: {"gross": 0.0, "net": 0.0, "count": 0})

        for doc in self.income_docs:
            gross = float(doc.get("gross_salary") or 0)
            net = float(doc.get("net_salary") or 0)

            total_gross += gross
            total_net += net

            employer = doc.get("employer_name") or "Unknown"
            by_employer[employer]["gross"] += gross
            by_employer[employer]["net"] += net
            by_employer[employer]["count"] += 1

        doc_count = len(self.income_docs)

        return {
            "document_count": doc_count,
            "total_gross_income": round(total_gross, 2),
            "total_net_income": round(total_net, 2),
            "average_monthly_gross": round(self.safe_divide(total_gross, doc_count), 2),
            "average_monthly_net": round(self.safe_divide(total_net, doc_count), 2),
            "employers": [{"employer": k, **v} for k, v in by_employer.items()],
        }

    def summarize_injuries(self) -> dict[str, Any]:
        """Summarize injuries from medical reports."""
        if not self.reports:
            return {
                "document_count": 0,
                "injury_types": [],
                "serious_findings": False,
                "all_injuries": [],
                "anatomical_regions": [],
                "requires_escalation": False,
            }

        injury_types = set()
        all_injuries = set()
        anatomical_regions = set()
        serious_findings = False

        for report in self.reports:
            injury_type = report.get("type of injury")
            if injury_type:
                injury_types.add(injury_type)

            injuries = report.get("list of all injuries mentioned") or []
            for injury in injuries:
                if injury:
                    all_injuries.add(injury)

            anatomical = report.get("anatomical_findings") or []
            for finding in anatomical:
                if isinstance(finding, dict):
                    region = finding.get("region")
                    if region:
                        anatomical_regions.add(region)
                    if finding.get("is serious"):
                        serious_findings = True

        return {
            "document_count": len(self.reports),
            "injury_types": list(injury_types),
            "serious_findings": serious_findings,
            "all_injuries": list(all_injuries),
            "anatomical_regions": list(anatomical_regions),
            "requires_escalation": serious_findings,
        }

    def calculate_all(self) -> dict[str, Any]:
        """Calculate all claim metrics."""
        expenses = self.calculate_expense_totals()
        income = self.calculate_income_summary()
        injuries = self.summarize_injuries()

        return {
            "expenses": expenses,
            "income": income,
            "injuries": injuries,
        }

    def format_currency(self, value: float) -> str:
        """Format value as SGD currency."""
        return f"${value:,.2f}"

    def format_percentage(self, value: float) -> str:
        """Format value as percentage."""
        return f"{value * 100:.1f}%"


def calculate_claims_from_data(document_data: dict[str, Any]) -> dict[str, Any]:
    """
    Main function to calculate all claim metrics from document data.

    Args:
        document_data: Dictionary with extracted document splits

    Returns:
        Dictionary with calculated metrics and summary
    """
    calculator = ClaimCalculator(document_data)
    metrics = calculator.calculate_all()

    # Generate claim summary
    expenses = metrics["expenses"]
    income = metrics["income"]
    injuries = metrics["injuries"]

    summary = {
        "total_claim_amount": expenses["total_gross"],
        "total_out_of_pocket": expenses["total_out_of_pocket"],
        "coverage_ratio": expenses["coverage_ratio"],
        "average_monthly_income": income["average_monthly_gross"],
        "serious_injury": injuries["serious_findings"],
        "requires_escalation": injuries["requires_escalation"],
    }

    return {
        "summary": summary,
        "details": metrics,
        "formatted": {
            "total_claim": calculator.format_currency(expenses["total_gross"]),
            "out_of_pocket": calculator.format_currency(expenses["total_out_of_pocket"]),
            "coverage": calculator.format_percentage(expenses["coverage_ratio"]),
            "monthly_income": calculator.format_currency(income["average_monthly_gross"]),
        },
        "document_counts": {
            "expenses": expenses["document_count"],
            "income": income["document_count"],
            "medical_reports": injuries["document_count"],
        },
    }


def generate_summary(metrics: dict[str, Any]) -> str:
    """Generate a text summary of the claim analysis."""
    summary_parts = []

    expenses = metrics.get("expenses", {})
    if expenses.get("total_gross", 0) > 0:
        summary_parts.append(
            f"Total medical expenses of ${expenses['total_gross']:,.2f} with "
            f"{'strong' if expenses['coverage_ratio'] > 0.7 else 'moderate' if expenses['coverage_ratio'] > 0.4 else 'limited'} "
            f"coverage ({expenses['coverage_ratio'] * 100:.0f}%)."
        )

    income = metrics.get("income", {})
    if income.get("average_monthly_gross", 0) > 0:
        summary_parts.append(
            f"Average monthly income of ${income['average_monthly_gross']:,.2f} "
            f"establishes baseline for loss-of-earning claims."
        )

    injuries = metrics.get("injuries", {})
    if injuries.get("serious_findings"):
        summary_parts.append(
            "Serious injury findings flagged - escalation to legal team recommended."
        )
    elif injuries.get("document_count", 0) > 0:
        summary_parts.append(
            f"Medical reports document {len(injuries.get('all_injuries', []))} injuries "
            f"affecting {len(injuries.get('anatomical_regions', []))} anatomical regions."
        )

    return " ".join(summary_parts) if summary_parts else "Insufficient data for summary."


# Example usage
if __name__ == "__main__":
    # Sample document data
    sample_data = {
        "splits": [
            {
                "tag_id": "medical_expense",
                "provider_name": "Singapore General Hospital",
                "document_date": "2024-01-15",
                "total_amount_before_deductions": {"amount": 5000, "iso_4217_currency_code": "SGD"},
                "cash_amount": {"amount": 1500, "iso_4217_currency_code": "SGD"},
                "medisave_amount": {"amount": 2000, "iso_4217_currency_code": "SGD"},
                "medishield_amount": {"amount": 1000, "iso_4217_currency_code": "SGD"},
                "insurance_amount": {"amount": 500, "iso_4217_currency_code": "SGD"},
            },
            {
                "tag_id": "medical_expense",
                "provider_name": "Mt Elizabeth Hospital",
                "document_date": "2024-02-20",
                "total_amount_before_deductions": {"amount": 3000, "iso_4217_currency_code": "SGD"},
                "cash_amount": {"amount": 800, "iso_4217_currency_code": "SGD"},
                "medisave_amount": {"amount": 1200, "iso_4217_currency_code": "SGD"},
                "insurance_amount": {"amount": 1000, "iso_4217_currency_code": "SGD"},
            },
            {
                "tag_id": "income_document",
                "employer_name": "Tech Corp Pte Ltd",
                "gross_salary": 6000,
                "net_salary": 5200,
            },
            {
                "tag_id": "income_document",
                "employer_name": "Tech Corp Pte Ltd",
                "gross_salary": 6000,
                "net_salary": 5200,
            },
            {
                "tag_id": "medical_report",
                "type of injury": "leg",
                "list of all injuries mentioned": ["ACL tear", "meniscus damage"],
                "anatomical_findings": [
                    {"region": "knee", "is serious": True},
                    {"region": "tibia", "is serious": False},
                ],
            },
        ]
    }

    results = calculate_claims_from_data(sample_data)
    print(json.dumps(results, indent=2))
    print("\n" + "=" * 60)
    print("SUMMARY:")
    print(generate_summary(results["details"]))
