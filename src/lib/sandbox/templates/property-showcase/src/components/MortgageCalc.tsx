/**
 * Mortgage payment calculator for the property showcase template.
 */
import { useState } from "react";

interface MortgageCalcProps {
  price: number;
}

function formatCurrency(value: number): string {
  return new Intl.NumberFormat("en-SG", {
    style: "currency",
    currency: "SGD",
    maximumFractionDigits: 0,
  }).format(Math.round(value));
}

function calculateMonthlyPayment(principal: number, annualRate: number, years: number): number {
  const monthlyRate = annualRate / 12;
  const months = years * 12;

  if (monthlyRate === 0) {
    return principal / months;
  }

  return principal * (monthlyRate / (1 - (1 + monthlyRate) ** -months));
}

export function MortgageCalc({ price }: MortgageCalcProps) {
  const [downPaymentRatio, setDownPaymentRatio] = useState(0.25);
  const [interestRate, setInterestRate] = useState(0.035);

  const loanAmount = price * (1 - downPaymentRatio);
  const monthlyPayment = calculateMonthlyPayment(loanAmount, interestRate, 30);

  return (
    <section className="rounded-[2rem] border border-white/10 bg-white/6 p-6 shadow-xl shadow-black/10">
      <p className="text-sm uppercase tracking-[0.2em] text-stone-400">Financing Snapshot</p>
      <h2 className="mt-2 text-2xl font-semibold text-white">Estimated monthly payment</h2>
      <p className="mt-4 text-4xl font-semibold text-amber-200">
        {formatCurrency(monthlyPayment)}
      </p>
      <div className="mt-6 space-y-5 text-sm text-stone-200">
        <label className="block space-y-2">
          <span className="flex items-center justify-between">
            Down payment
            <strong>{Math.round(downPaymentRatio * 100)}%</strong>
          </span>
          <input
            className="w-full accent-amber-300"
            max={0.5}
            min={0.1}
            onChange={(event) => setDownPaymentRatio(Number(event.target.value))}
            step={0.05}
            type="range"
            value={downPaymentRatio}
          />
        </label>
        <label className="block space-y-2">
          <span className="flex items-center justify-between">
            Interest rate
            <strong>{(interestRate * 100).toFixed(2)}%</strong>
          </span>
          <input
            className="w-full accent-amber-300"
            max={0.06}
            min={0.02}
            onChange={(event) => setInterestRate(Number(event.target.value))}
            step={0.0025}
            type="range"
            value={interestRate}
          />
        </label>
      </div>
    </section>
  );
}
