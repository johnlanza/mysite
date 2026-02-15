export const US_STATE_CODES = [
  'AL', 'AK', 'AZ', 'AR', 'CA', 'CO', 'CT', 'DE', 'FL', 'GA', 'HI', 'ID', 'IL', 'IN', 'IA', 'KS', 'KY', 'LA', 'ME',
  'MD', 'MA', 'MI', 'MN', 'MS', 'MO', 'MT', 'NE', 'NV', 'NH', 'NJ', 'NM', 'NY', 'NC', 'ND', 'OH', 'OK', 'OR', 'PA',
  'RI', 'SC', 'SD', 'TN', 'TX', 'UT', 'VT', 'VA', 'WA', 'WV', 'WI', 'WY', 'DC'
] as const;

const CITY_PATTERN = /^[A-Za-z][A-Za-z .'-]{1,79}$/;
const POSTAL_PATTERN = /^\d{5}(?:-\d{4})?$/;

export type AddressInput = {
  addressLine1: string;
  addressLine2?: string;
  city: string;
  state: string;
  postalCode: string;
};

export function normalizeAddressInput(raw: Partial<AddressInput>) {
  return {
    addressLine1: String(raw.addressLine1 || '').trim(),
    addressLine2: String(raw.addressLine2 || '').trim(),
    city: String(raw.city || '').trim(),
    state: String(raw.state || '').trim().toUpperCase(),
    postalCode: String(raw.postalCode || '').trim()
  };
}

export function validateAddressInput(address: AddressInput | ReturnType<typeof normalizeAddressInput>) {
  if (!address.addressLine1) {
    return 'Address line 1 is required.';
  }

  if (!address.city || !CITY_PATTERN.test(address.city)) {
    return 'City is required and must be a valid city name.';
  }

  if (!US_STATE_CODES.includes(address.state as (typeof US_STATE_CODES)[number])) {
    return 'State must be a valid 2-letter US state code.';
  }

  if (!POSTAL_PATTERN.test(address.postalCode)) {
    return 'Postal code must be a valid US ZIP code.';
  }

  return null;
}

export function formatAddress(address: Partial<AddressInput> & { address?: string }) {
  if (address.addressLine1 && address.city && address.state && address.postalCode) {
    const line1 = [address.addressLine1, address.addressLine2].filter(Boolean).join(', ');
    const line2 = `${address.city}, ${address.state} ${address.postalCode}`;
    return `${line1}, ${line2}`;
  }

  return String(address.address || '').trim();
}
