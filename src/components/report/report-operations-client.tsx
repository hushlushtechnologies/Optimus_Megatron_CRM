"use client";

import { motion } from "motion/react";
import { Info } from "lucide-react";

import { ReportCountBreakdown } from "@/src/components/report/report-count-breakdown";
import { ReportFigureCard } from "@/src/components/report/report-figure-card";
import { ReportPeriodPicker } from "@/src/components/report/report-period-picker";
import { useMotion } from "@/src/hooks/use-motion";
import type { ReportFigure } from "@/src/lib/supabase/report-aggregate";
import {
  NO_TEST_DRIVE_CONVERSION_NOTE,
  OPERATIONS_METRICS,
  type OperationsReportData,
} from "@/src/lib/types/report-operations";
import type { Money } from "@/src/lib/utils/report-money";
import type { ReportRangeId } from "@/src/lib/utils/report-time";

/*
|--------------------------------------------------------------------------
| OPERATIONS
|--------------------------------------------------------------------------
|
| Test drives, reservations and enquiries, each in its own section because
| each counts a different thing and the three are not meant to be added up.
|
| The note under the test drive section is the one piece of text on this page
| that had to be written rather than computed: there is no link in the schema
| between a test drive and a sale, so that conversion is absent, and a reader
| looking for it deserves to know it is missing on purpose.
*/

interface ReportOperationsClientProps {
  data: OperationsReportData;
  range: ReportRangeId;
  canSeeFinancial: boolean;
}

export function ReportOperationsClient({
  data,
  range,
  canSeeFinancial,
}: ReportOperationsClientProps) {
  const { fadeUp } = useMotion();

  const figures: Record<string, ReportFigure<number | Money>> = {
    testDrivesTotal: data.testDrivesTotal,
    testDrivesCompleted: data.testDrivesCompleted,
    testDriveCompletionRate: data.testDriveCompletionRate as ReportFigure<number>,
    reservationsTotal: data.reservationsTotal,
    activeHolds: data.activeHolds,
    reservationsConverted: data.reservationsConverted,
    reservationConversionRate: data.reservationConversionRate as ReportFigure<number>,
    depositsVerified: data.depositsVerified,
    enquiriesTotal: data.enquiriesTotal,
    enquiriesCompleted: data.enquiriesCompleted,
    enquiriesConverted: data.enquiriesConverted,
  };

  const visible = OPERATIONS_METRICS.filter((metric) => canSeeFinancial || !metric.financial);

  const cardsFor = (group: "testDrives" | "reservations" | "enquiries") =>
    visible.filter((metric) => metric.group === group);

  const isPercent = (id: string) =>
    id === "testDriveCompletionRate" || id === "reservationConversionRate";

  const renderCards = (group: "testDrives" | "reservations" | "enquiries") => (
    <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 xl:grid-cols-4">
      {cardsFor(group).map((metric, index) => (
        <motion.div key={metric.id} {...fadeUp(index)} className="min-w-0">
          <ReportFigureCard
            label={metric.label}
            definition={metric.definition}
            basis={metric.basis}
            figure={figures[metric.id]}
            suffix={isPercent(metric.id) ? "%" : undefined}
          />
        </motion.div>
      ))}
    </div>
  );

  return (
    <div className="flex flex-col gap-6">
      <ReportPeriodPicker active={range} label={data.rangeLabel} />

      {/* =====================================================
          TEST DRIVES
      ===================================================== */}

      <section className="flex flex-col gap-4">
        <h2 className="text-h4">Test drives</h2>

        {renderCards("testDrives")}

        <div
          role="note"
          className="border-border bg-card-hover flex items-start gap-2.5 rounded-lg border px-4 py-3"
        >
          <Info className="text-text-subtle mt-0.5 size-4 shrink-0" aria-hidden="true" />
          <p className="text-body-sm text-text-muted">{NO_TEST_DRIVE_CONVERSION_NOTE}</p>
        </div>

        <div className="grid grid-cols-1 gap-4 xl:grid-cols-3">
          <ReportCountBreakdown
            title="Test drives by status"
            figure={data.testDrivesByStatus}
            nameLabel="Status"
            unit="drives"
            emptyMessage="No test drives were booked in this period."
          />
          <ReportCountBreakdown
            title="By showroom"
            figure={data.testDrivesByShowroom}
            nameLabel="Showroom"
            unit="drives"
            emptyMessage="No test drives were booked in this period."
          />
          <ReportCountBreakdown
            title="By staff"
            description="The staff member assigned to the drive."
            figure={data.testDrivesByStaff}
            nameLabel="Staff"
            unit="drives"
            emptyMessage="No test drives were booked in this period."
          />
        </div>
      </section>

      {/* =====================================================
          RESERVATIONS
      ===================================================== */}

      <section className="flex flex-col gap-4">
        <h2 className="text-h4">Reservations</h2>

        {renderCards("reservations")}

        <div className="grid grid-cols-1 gap-4 xl:grid-cols-2">
          <ReportCountBreakdown
            title="Reservations by status"
            figure={data.reservationsByStatus}
            nameLabel="Status"
            unit="reservations"
            emptyMessage="No reservations were raised in this period."
          />
          <ReportCountBreakdown
            title="By showroom"
            figure={data.reservationsByShowroom}
            nameLabel="Showroom"
            unit="reservations"
            emptyMessage="No reservations were raised in this period."
          />
        </div>
      </section>

      {/* =====================================================
          ENQUIRIES
      ===================================================== */}

      <section className="flex flex-col gap-4">
        <h2 className="text-h4">Enquiries</h2>

        {renderCards("enquiries")}

        <div className="grid grid-cols-1 gap-4 xl:grid-cols-2">
          <ReportCountBreakdown
            title="Enquiries by type"
            description="Finance, Sell My Car, Trade-In, Dream Car and General."
            figure={data.enquiriesByType}
            nameLabel="Type"
            unit="enquiries"
            emptyMessage="No enquiries were received in this period."
          />
          <ReportCountBreakdown
            title="By status"
            figure={data.enquiriesByStatus}
            nameLabel="Status"
            unit="enquiries"
            emptyMessage="No enquiries were received in this period."
          />
          <ReportCountBreakdown
            title="By source"
            figure={data.enquiriesBySource}
            nameLabel="Source"
            unit="enquiries"
            emptyMessage="No enquiries were received in this period."
          />
          <ReportCountBreakdown
            title="By priority"
            figure={data.enquiriesByPriority}
            nameLabel="Priority"
            unit="enquiries"
            emptyMessage="No enquiries were received in this period."
          />
        </div>

        <ReportCountBreakdown
          title="Enquiries by staff"
          description="The staff member the enquiry is assigned to."
          figure={data.enquiriesByStaff}
          nameLabel="Staff"
          unit="enquiries"
          emptyMessage="No enquiries were received in this period."
        />
      </section>

      {!canSeeFinancial && (
        <p className="text-caption text-text-subtle">
          Deposit figures are not shown with your current access.
        </p>
      )}
    </div>
  );
}
