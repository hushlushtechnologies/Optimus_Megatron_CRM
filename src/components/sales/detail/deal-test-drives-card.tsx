"use client";

import Link from "next/link";
import { motion } from "motion/react";
import { CarFront } from "lucide-react";

import { TestDrivePanelList } from "@/src/components/test-drives/panel/test-drive-panel-list";
import { useMotion } from "@/src/hooks/use-motion";
import type { TestDrivePanelLoad } from "@/src/lib/types/test-drive";

interface DealTestDrivesCardProps {
  load: TestDrivePanelLoad;
  /** The drive this deal was started from, so it can be called out. */
  sourceTestDriveNumber: string | null;
  customerName: string;
}

/**
 * The test drives behind a deal, on the deal's Overview tab.
 *
 * It renders the same panel the Lead and Customer pages use, so a drive reads
 * identically everywhere. Deliberately read-only: the Test Drive module stays
 * the only place a drive is changed.
 */
export function DealTestDrivesCard({
  load,
  sourceTestDriveNumber,
  customerName,
}: DealTestDrivesCardProps) {
  const { fadeUp } = useMotion();

  return (
    <motion.section {...fadeUp(2)} aria-label="Test drives" className="surface-card flex flex-col gap-4 p-5">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="text-label">Test drives</p>
          <p className="text-caption text-text-subtle mt-1">
            {customerName}&apos;s drives of this vehicle. Changes are made in Test Drives.
          </p>
        </div>

        {sourceTestDriveNumber && (
          <span className="border-border bg-card-hover/40 text-caption text-text-muted inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1">
            <CarFront className="size-3.5 shrink-0" aria-hidden="true" />
            Started from {sourceTestDriveNumber}
          </span>
        )}
      </div>

      <TestDrivePanelList
        load={load}
        showLead
        emptyTitle="No test drive for this vehicle"
        emptyDescription="This customer hasn't driven this vehicle. Book one from the Test Drives page if they'd like to."
      />

      <Link
        href="/admin/test-drives"
        className="text-body-sm text-primary-text hover:text-primary-hover focus-visible:ring-primary self-start rounded focus-visible:ring-2 focus-visible:outline-none"
      >
        Open Test Drives
      </Link>
    </motion.section>
  );
}