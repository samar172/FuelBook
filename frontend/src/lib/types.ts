// Shared API shapes for credit customers, their vehicles, and employees.
// Money is paise and volume is ml, both serialized as strings (BigInt) by the API.

export type VehicleType = "TRUCK" | "BUS" | "CAR" | "TRACTOR" | "TWO_WHEELER" | "GENSET" | "OTHER";

export type FuelType = "HSD" | "MS" | "MS_POWER" | "CNG";

export const VEHICLE_TYPES: VehicleType[] = [
  "TRUCK",
  "BUS",
  "CAR",
  "TRACTOR",
  "TWO_WHEELER",
  "GENSET",
  "OTHER",
];

export const VEHICLE_TYPE_LABELS: Record<VehicleType, string> = {
  TRUCK: "Truck",
  BUS: "Bus",
  CAR: "Car",
  TRACTOR: "Tractor",
  TWO_WHEELER: "Two-wheeler",
  GENSET: "Genset",
  OTHER: "Other",
};

export type Vehicle = {
  id: string;
  customerId: string;
  vehicleNo: string;
  type: VehicleType;
  makeModel: string | null;
  fuelType: FuelType | null;
  capacityMl: string | null;
  isPrimary: boolean;
  isActive: boolean;
  notes: string | null;
};

export type CreditCustomer = {
  id: string;
  pumpId: string;
  code: string | null;
  name: string;
  contactPerson: string | null;
  phone: string | null;
  altPhone: string | null;
  email: string | null;
  addressLine: string | null;
  city: string | null;
  state: string | null;
  pincode: string | null;
  gstin: string | null;
  creditLimitPaise: string;
  currentBalancePaise: string;
  paymentTermsDays: number;
  isActive: boolean;
  notes: string | null;
  vehicles: Vehicle[];
  _count?: { vehicles: number };
};

export type Employee = {
  id: string;
  pumpId: string;
  code: string | null;
  name: string;
  designation: string | null;
  phone: string | null;
  altPhone: string | null;
  dateOfBirth: string | null;
  addressLine: string | null;
  city: string | null;
  state: string | null;
  pincode: string | null;
  joiningDate: string | null;
  exitDate: string | null;
  emergencyContactName: string | null;
  emergencyContactPhone: string | null;
  isActive: boolean;
  notes: string | null;
};

// The active vehicle flagged primary, else the first active one, else the first of any.
export const primaryVehicle = (
  vehicles: Vehicle[] | undefined | null
): Vehicle | undefined => {
  if (!vehicles || vehicles.length === 0) return undefined;
  const active = vehicles.filter((v) => v.isActive);
  const pool = active.length > 0 ? active : vehicles;
  return pool.find((v) => v.isPrimary) ?? pool[0];
};

// "MH12AB1234 +2" style summary for list rows and dropdown labels.
export const vehicleSummary = (vehicles: Vehicle[] | undefined | null): string => {
  const primary = primaryVehicle(vehicles);
  if (!primary) return "";
  const extra = (vehicles?.filter((v) => v.isActive).length || 0) - 1;
  return extra > 0 ? `${primary.vehicleNo} +${extra}` : primary.vehicleNo;
};

// The API returns { error: "..." } on validation failures; surface it verbatim.
export const apiError = (e: unknown, fallback = "Failed"): string => {
  const err = e as { response?: { data?: { error?: string } }; message?: string };
  return err?.response?.data?.error || err?.message || fallback;
};

// An ISO timestamp from the API -> the "YYYY-MM-DD" an <input type="date"> wants.
export const toDateInput = (iso: string | null | undefined): string =>
  iso ? iso.slice(0, 10) : "";
