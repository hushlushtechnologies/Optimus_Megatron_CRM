import { getCurrentProfile } from "@/src/lib/supabase/get-profiles";

import { GreetingBanner } from "@/src/components/dashboard/greeting-banner";
import { getDashboardData } from "@/src/lib/supabase/dashboard-queries";

import { RevenueChart } from "@/src/components/dashboard/revenue-chart";
import { InventoryStatus } from "@/src/components/dashboard/inventory-status";

import { FastestSelling } from "@/src/components/dashboard/fastest-selling";
import { TopSalesExecutive } from "@/src/components/dashboard/top-sales-executive";
import { ConversionFunnel } from "@/src/components/dashboard/conversion-funnel";

import { RecentActivity } from "@/src/components/dashboard/recent-activity";
import { UpcomingTestDrives } from "@/src/components/dashboard/upcoming-test-drives";
import { LeadSummary } from "@/src/components/dashboard/lead-summary";



export default async function AdminDashboardPage() {
    const [profile, data] = await Promise.all([getCurrentProfile(), getDashboardData()]);

  const firstName = profile?.full_name?.trim().split(/\s+/)[0] || "Admin";

  return (
    <div className="flex min-w-0 flex-col gap-5 pb-6 lg:gap-6 lg:pb-8">
      {/* =====================================================
          GREETING / DASHBOARD INTRO
      ===================================================== */}

      <section aria-label="Dashboard greeting" className="min-w-0">
        <GreetingBanner name={firstName} alerts={data.alerts} />
      </section>

      {/* =====================================================
          KPI OVERVIEW
      ===================================================== */}

      {/* <section
        aria-label="Key performance indicators"
        className="grid min-w-0 grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4"
      >
        {data.kpis.map((kpi) => (
          <div key={kpi.id} className="min-w-0">
            <KpiCard
              id={kpi.id}
              label={kpi.label}
              value={kpi.value}
              prefix={kpi.prefix}
              change={kpi.change}
              trend={kpi.trend}
            />
          </div>
        ))}
      </section> */}

      {/* =====================================================
          ANALYTICS ROW
          Revenue + Inventory
      ===================================================== */}

      <section
        aria-label="Revenue and inventory analytics"
        className="grid min-w-0 grid-cols-1 gap-4 xl:grid-cols-12"
      >
        {/* Revenue needs more horizontal space */}

        <div className="min-w-0 xl:col-span-7">
          <RevenueChart data={data.revenueTrend} />
        </div>

        {/* Inventory */}

        <div className="min-w-0 xl:col-span-5">
          <InventoryStatus data={data.inventoryStatus} />
        </div>
      </section>

      {/* =====================================================
          SALES PERFORMANCE
          
          IMPORTANT:
          Do not force 3 columns at md.
          These are information-heavy cards.
      ===================================================== */}

      <section
        aria-label="Sales performance"
        className="grid min-w-0 grid-cols-1 gap-4 lg:grid-cols-2 2xl:grid-cols-12"
      >
        {/* Fastest selling */}

        <div className="min-w-0 2xl:col-span-4">
          <FastestSelling data={data.fastestSelling} />
        </div>

        {/* Top executive */}

        <div className="min-w-0 2xl:col-span-4">
          <TopSalesExecutive data={data.topExecutive} />
        </div>

        {/* Conversion */}

        <div className="min-w-0 lg:col-span-2 2xl:col-span-4">
          <ConversionFunnel data={data.conversion} />
        </div>
      </section>

      {/* =====================================================
          OPERATIONS / CRM
          
          All 3 need enough width.
          The old 5 / 4 / 3 layout made LeadSummary too narrow.
      ===================================================== */}

      <section
        aria-label="Operational activity"
        className="grid min-w-0 grid-cols-1 gap-4 xl:grid-cols-2 2xl:grid-cols-12"
      >
        {/* Recent activity */}

        <div className="min-w-0 2xl:col-span-4">
          <RecentActivity data={data.recentActivity} />
        </div>

        {/* Test drives */}

        <div className="min-w-0 2xl:col-span-4">
          <UpcomingTestDrives data={data.upcomingTestDrives} />
        </div>

        {/* Lead summary */}

        <div className="min-w-0 xl:col-span-2 2xl:col-span-4">
          <LeadSummary data={data.leadSources} />
        </div>
      </section>
    </div>
  );
}
