/**
 * CRM companies list page with search and industry filter controls.
 * @module app/(dashboard)/crm/companies/page
 */
"use client";

import { useMemo, useState } from "react";

import { AppIcon } from "@/components/icons/app-icons";
import { CompaniesTable } from "@/components/crm/companies-table";
import { RecordDrawer } from "@/components/crm/record-drawer";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useCompanies } from "@/hooks/use-companies";
import { useCrmConfig } from "@/hooks/use-crm-config";
import { useRecordDrawer } from "@/hooks/use-record-drawer";
import { formatCrmEnumLabel } from "@/lib/crm/display";

const allCompanyIndustries = "all";

export default function CompaniesPage() {
  const [search, setSearch] = useState("");
  const [industryFilter, setIndustryFilter] = useState<string>(allCompanyIndustries);
  const { isOpen, recordId, open, close } = useRecordDrawer();
  const { data: crmConfigResult } = useCrmConfig();

  const companyFilters = useMemo(() => {
    const normalizedSearch = search.trim();

    return {
      search: normalizedSearch.length > 0 ? normalizedSearch : undefined,
      industry: industryFilter === allCompanyIndustries ? undefined : industryFilter,
    };
  }, [industryFilter, search]);

  const companyIndustryOptions = crmConfigResult?.config.company_industries ?? [];
  const { data: companies = [], isLoading, isError, refetch } = useCompanies(companyFilters);

  const tableCompanies = useMemo(
    () =>
      companies.map((company) => ({
        ...company,
        contactCount: company.contact_count,
        dealCount: company.deal_count,
      })),
    [companies],
  );

  return (
    <div className="overflow-auto px-4 py-6 md:px-12 md:py-10">
      <div>
        <h1 className="text-2xl font-bold tracking-tight text-foreground">Companies</h1>
        <p className="mt-2 text-sm text-muted-foreground/80">
          Browse and inspect companies created by your AI agent.
        </p>
      </div>

      <div className="mt-6 flex flex-col gap-3 sm:flex-row sm:items-center">
        <div className="relative flex-1">
          <AppIcon
            name="search"
            className="absolute left-4 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground/60"
          />
          <Input
            value={search}
            onChange={(event) => setSearch(event.target.value)}
            placeholder="Search by name, website, email, or phone..."
            className="h-12 w-full border-border/50 pl-11 shadow-sm focus-visible:ring-1"
          />
        </div>
        <Select value={industryFilter} onValueChange={setIndustryFilter}>
          <SelectTrigger className="h-12 w-full border-border/50 shadow-sm sm:w-56">
            <SelectValue placeholder="All industries" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value={allCompanyIndustries}>All industries</SelectItem>
            {companyIndustryOptions.map((industry) => (
              <SelectItem key={industry} value={industry}>
                {formatCrmEnumLabel(industry)}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      <div className="mt-6">
        {isLoading ? (
          <div className="animate-pulse space-y-3">
            {Array.from({ length: 6 }).map((_, index) => (
              <div key={index} className="h-14 rounded-lg bg-muted/30" />
            ))}
          </div>
        ) : isError ? (
          <div className="rounded-xl border border-destructive/20 bg-destructive/5 p-6">
            <p className="text-sm text-destructive">Unable to load companies</p>
            <Button
              type="button"
              variant="outline"
              size="sm"
              className="mt-3"
              onClick={() => {
                void refetch();
              }}
            >
              Retry
            </Button>
          </div>
        ) : tableCompanies.length === 0 ? (
          <div className="rounded-xl border border-border/40 bg-card p-10 text-center shadow-sm md:p-20">
            <AppIcon name="building" className="mx-auto h-12 w-12 text-muted-foreground/40" />
            <p className="mt-6 text-muted-foreground">
              {companyFilters.search || companyFilters.industry
                ? "No companies match your filters"
                : "No companies yet"}
            </p>
          </div>
        ) : (
          <CompaniesTable companies={tableCompanies} onRowClick={open} />
        )}
      </div>

      <RecordDrawer isOpen={isOpen} recordId={recordId} objectType="company" onClose={close} />
    </div>
  );
}
