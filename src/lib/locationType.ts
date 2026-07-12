/** Head Office vs Retail Store classification from an employee's location. */
export type LocationType = 'Head Office' | 'Retail Store';

export function locationType(location: string | null | undefined): LocationType | null {
  if (!location) return null;
  return /hq|head|office/i.test(location) ? 'Head Office' : 'Retail Store';
}

/** Consistent colours for the two groups across Attendance and Leave. */
export const LOCATION_TYPE_STYLE: Record<LocationType, { badge: string; bar: string; dot: string }> = {
  'Head Office': { badge: 'bg-indigo-100 text-indigo-700 border-indigo-200', bar: 'bg-indigo-500', dot: 'bg-indigo-500' },
  'Retail Store': { badge: 'bg-teal-100 text-teal-700 border-teal-200', bar: 'bg-teal-500', dot: 'bg-teal-500' },
};
