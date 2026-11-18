/*
|--------------------------------------------------------------------------
| DASHBOARD SHAPES
|--------------------------------------------------------------------------
|
| These mirror exactly what the ten dashboard widgets already rendered, so
| the components keep their design and only change where the numbers come
| from. src/lib/mock-data/dashboard.ts is deleted once these are wired.
*/

export interface DashboardKpi {
  /** Drives the card's icon and colour: revenue | available-cars | customers | pending. */
  id: string;
  label: string;
  value: number;
  prefix?: string;
  /** Percentage against the previous period. Negative shows a red arrow. */
  change: number;
  /** Sparkline points, oldest first. */
  trend: number[];
}

export interface DashboardAlert {
  id: string;
  message: string;
}

/** One point of the revenue chart. `revenue` is in millions, as the chart labels say. */
export interface RevenuePoint {
  month: string;
  revenue: number;
}

export interface InventoryStatusSlice {
  name: string;
  value: number;
  color: string;
}

export interface FastestSellingCar {
  id: string;
  name: string;
  location: string;
  daysToSell: number;
}

export interface TopExecutive {
  name: string;
  location: string;
  dealsClosed: number;
  revenue: number;
}

export interface ConversionCounts {
  leads: number;
  testDrives: number;
  reservations: number;
  sold: number;
}

export interface ActivityEntry {
  id: string;
  label: string;
  detail: string;
  /** Already humanised, e.g. "12 minutes ago". */
  time: string;
}

export interface UpcomingTestDrive {
  id: string;
  customer: string;
  car: string;
  /** Must begin "Today" or "Tomorrow" when it is, so the chip renders. */
  time: string;
}

export interface LeadSourceCount {
  source: string;
  count: number;
}

export interface DashboardData {
  kpis: DashboardKpi[];
  alerts: DashboardAlert[];
  revenueTrend: RevenuePoint[];
  inventoryStatus: InventoryStatusSlice[];
  fastestSelling: FastestSellingCar[];
  topExecutive: TopExecutive | null;
  conversion: ConversionCounts;
  recentActivity: ActivityEntry[];
  upcomingTestDrives: UpcomingTestDrive[];
  leadSources: LeadSourceCount[];
}