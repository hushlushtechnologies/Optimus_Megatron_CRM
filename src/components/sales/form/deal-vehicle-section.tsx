"use client";

import { Loader2, MapPin } from "lucide-react";
import { FormSection } from "@/src/components/test-drives/form/form-section";
import { SearchSelect } from "@/src/components/test-drives/form/search-select";
import { DealNotices } from "@/src/components/sales/form/deal-form-notice";
import { searchDealVehiclesAction } from "@/app/admin/sales/new/actions";
import type { ContextMessages } from "@/src/lib/utils/sales-deal-form";
import type { TestDriveVehicleOption } from "@/src/lib/types/test-drive";

interface DealVehicleSectionProps {
  value: TestDriveVehicleOption | null;
  onChange: (vehicle: TestDriveVehicleOption | null) => void;
  messages: ContextMessages;
  /** The database check for this vehicle is still running. */
  checking: boolean;
  /** The check could not be completed. The database still blocks conflicts when saving. */
  checkFailed: boolean;
  error?: string;
}

function VehicleRow({ vehicle }: { vehicle: TestDriveVehicleOption }) {
  return (
    <div className="min-w-0">
      <p className="text-text-primary truncate font-medium">{vehicle.display_title}</p>
      <p className="text-caption text-text-subtle truncate">
        {vehicle.stock_id}
        {vehicle.brand_name ? ` · ${vehicle.brand_name}` : ""}
        {vehicle.location_name ? ` · ${vehicle.location_name}` : ""}
        {vehicle.status_name ? ` · ${vehicle.status_name}` : ""}
      </p>
    </div>
  );
}

export function DealVehicleSection({
  value,
  onChange,
  messages,
  checking,
  checkFailed,
  error,
}: DealVehicleSectionProps) {
  return (
    <FormSection step={2} title="Vehicle" description="Which vehicle is being sold?">
      <SearchSelect<TestDriveVehicleOption>
        label="Vehicle"
        required
        placeholder="Search by name, brand or stock ID…"
        value={value}
        onChange={onChange}
        search={searchDealVehiclesAction}
        renderOption={(vehicle) => <VehicleRow vehicle={vehicle} />}
        renderSelected={(vehicle) => <VehicleRow vehicle={vehicle} />}
        emptyMessage="No vehicles found. Check the name or stock ID."
        isOptionDisabled={(vehicle) => vehicle.is_sold}
        getDisabledReason={() => "Sold"}
        error={error}
        helper="Each listing is one physical vehicle. Several customers can have a draft on the same vehicle, but only one deal can hold it."
      />

      {value && (
        <div className="text-body-sm text-text-muted flex flex-wrap items-center gap-x-4 gap-y-1">
          {value.location_name && (
            <span className="inline-flex items-center gap-1.5">
              <MapPin className="size-3.5" aria-hidden="true" />
              Listed at {value.location_name}
            </span>
          )}
          {value.status_name && <span>Status: {value.status_name}</span>}
          {checking && (
            <span className="text-text-subtle inline-flex items-center gap-1.5" role="status">
              <Loader2 className="size-3.5 motion-safe:animate-spin" aria-hidden="true" />
              Checking this vehicle…
            </span>
          )}
        </div>
      )}

      {checkFailed && (
        <p
          role="status"
          className="text-body-sm text-text-primary rounded-md border border-amber-500/30 bg-amber-500/10 px-3 py-2"
        >
          We couldn&apos;t check this vehicle&apos;s current deals. You can still continue. The system re-checks
          when you save, and it blocks conflicts.
        </p>
      )}

      <DealNotices {...messages} />
    </FormSection>
  );
}