/* The brands' own logos, for the boutique signs. Each file in ./brands/ is the logo as the
   brand's official website serves it (brands.json says where and holds the original's
   fingerprint), with its empty margin trimmed and, if very large, scaled down evenly: never
   redrawn, recoloured, cropped into or stretched. A boutique whose brand has no file here
   keeps its painted name. Logos come in one colour, so each says which plate it needs:
   'dark' for a white logo, 'light' for a black one. `name_share` is the share of the logo's height
   the brand's name takes (measured from the file), which sizes the sign so the name reads.
   `painted_name` marks an emblem with no name in it (West End's W in a circle, published by
   the brand as its app icon on a black ground, made transparent): the plaque shows it with the
   name painted beside it, in the painted-name signs' lettering. */
import brands from './brands/brands.json';

const urls = import.meta.glob('./brands/*.png', { eager: true, query: '?url', import: 'default' }) as Record<string, string>;

export interface BrandLogo { key: string; url: string; plate: 'dark' | 'light'; aspect: number; nameShare: number; paintedName: boolean }

export const BRAND_LOGOS: Record<string, BrandLogo> = Object.fromEntries(
  Object.entries(brands as unknown as Record<string, { file: string; plate: 'dark' | 'light'; px: [number, number]; name_share?: number; painted_name?: boolean }>)
    .filter(([, b]) => urls[`./brands/${b.file}`])
    .map(([brand, b]) => [brand, { key: `logo:${b.file}`, url: urls[`./brands/${b.file}`], plate: b.plate, aspect: b.px[0] / b.px[1], nameShare: b.name_share ?? 0.3, paintedName: !!b.painted_name }]),
);
