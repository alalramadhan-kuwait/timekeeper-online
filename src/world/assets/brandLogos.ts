/* The brands' own logos, for the boutique signs. Each file in ./brands/ is the logo as the
   brand's official website serves it (brands.json says where and holds the original's
   fingerprint), with its empty margin trimmed and, if very large, scaled down evenly: never
   redrawn, recoloured, cropped into or stretched. A boutique whose brand has no file here
   keeps its painted name. Logos come in one colour, so each says which plate it needs:
   'dark' for a white logo, 'light' for a black one. */
import brands from './brands/brands.json';

const urls = import.meta.glob('./brands/*.png', { eager: true, query: '?url', import: 'default' }) as Record<string, string>;

export interface BrandLogo { key: string; url: string; plate: 'dark' | 'light'; aspect: number }

export const BRAND_LOGOS: Record<string, BrandLogo> = Object.fromEntries(
  Object.entries(brands as unknown as Record<string, { file: string; plate: 'dark' | 'light'; px: [number, number] }>)
    .filter(([, b]) => urls[`./brands/${b.file}`])
    .map(([brand, b]) => [brand, { key: `logo:${b.file}`, url: urls[`./brands/${b.file}`], plate: b.plate, aspect: b.px[0] / b.px[1] }]),
);
