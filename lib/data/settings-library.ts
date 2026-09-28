/*
  Libraries: estimate types, templates, area templates, surface rates,
  paint library, brands, materials, line items and terms.
  Values match the live app screenshots (June 2026), plus extra rows
  so each list has enough data to demo.
*/
import type {
  AreaTemplate, Brand, EstimateTemplate, EstimateType, LineItemTemplate, Material,
  PackageTemplate, PaintProduct, RateGroup, SurfaceRate, TermsCondition,
} from '../types';

const T = '2026-04-20T10:00:00.000Z';

export const estimateTypes: EstimateType[] = [
  { id: 'et_interior', name: 'Interior', description: 'Standard interior painting (walls, ceilings, trim)', hourlyRate: 85, sortOrder: 1 },
  { id: 'et_exterior', name: 'Exterior', description: 'Exterior painting, staining, and pressure washing', hourlyRate: 90, sortOrder: 2 },
  { id: 'et_cabinets', name: 'Cabinets', description: 'Kitchen and vanity cabinet refinishing', hourlyRate: 100, sortOrder: 3 },
];

/** Surface rate categories, in the order the live app shows them. */
export const rateGroups: RateGroup[] = [
  { id: 'rg_intwalls', name: 'Interior Walls', sortOrder: 1 },
  { id: 'rg_extwalls', name: 'Exterior Walls', sortOrder: 2 },
  { id: 'rg_ceilings', name: 'Ceilings & Floors', sortOrder: 3 },
  { id: 'rg_trim', name: 'Trim & Molding', sortOrder: 4 },
  { id: 'rg_cabinets', name: 'Cabinets', sortOrder: 5 },
];

export const surfaceRates: SurfaceRate[] = [
  // Interior Walls
  { id: 'sr_accent', name: 'Accent Wall', rateGroup: 'Interior Walls', unit: 'sqft', defaultCoats: 2, rateCoat1: 150, rateCoat2: 175, rateCoat3: 200, rateCoat4: 200, useMultipliers: true, sortOrder: 1 },
  { id: 'sr_highwalls', name: 'High Walls (10ft+)', rateGroup: 'Interior Walls', unit: 'sqft', defaultCoats: 2, rateCoat1: 120, rateCoat2: 140, rateCoat3: 160, rateCoat4: 160, useMultipliers: true, sortOrder: 2 },
  { id: 'sr_stdwalls', name: 'Standard Walls (8ft)', rateGroup: 'Interior Walls', unit: 'sqft', defaultCoats: 2, rateCoat1: 150, rateCoat2: 175, rateCoat3: 200, rateCoat4: 200, useMultipliers: true, sortOrder: 3 },
  // Exterior Walls
  { id: 'sr_singlewall', name: 'Single Wall', rateGroup: 'Exterior Walls', unit: 'sqft', defaultCoats: 2, rateCoat1: 100, rateCoat2: 120, rateCoat3: 140, rateCoat4: 140, useMultipliers: true, sortOrder: 1 },
  { id: 'sr_siding', name: 'Standard Siding', rateGroup: 'Exterior Walls', unit: 'sqft', defaultCoats: 2, rateCoat1: 100, rateCoat2: 120, rateCoat3: 140, rateCoat4: 140, useMultipliers: true, sortOrder: 2 },
  { id: 'sr_stucco', name: 'Stucco', rateGroup: 'Exterior Walls', unit: 'sqft', defaultCoats: 2, rateCoat1: 80, rateCoat2: 95, rateCoat3: 110, rateCoat4: 110, useMultipliers: true, sortOrder: 3 },
  // Ceilings & Floors
  { id: 'sr_ceiling', name: 'Flat Ceiling', rateGroup: 'Ceilings & Floors', unit: 'sqft', defaultCoats: 2, rateCoat1: 200, rateCoat2: 225, rateCoat3: 250, rateCoat4: 250, useMultipliers: true, sortOrder: 1 },
  { id: 'sr_floor', name: 'Floor', rateGroup: 'Ceilings & Floors', unit: 'sqft', defaultCoats: 2, rateCoat1: 200, rateCoat2: 225, rateCoat3: 250, rateCoat4: 250, useMultipliers: false, sortOrder: 2 },
  // Trim & Molding
  { id: 'sr_baseboard', name: 'Baseboard', rateGroup: 'Trim & Molding', unit: 'lnft', defaultCoats: 2, rateCoat1: 80, rateCoat2: 95, rateCoat3: 110, rateCoat4: 110, useMultipliers: true, sortOrder: 1 },
  { id: 'sr_crown', name: 'Crown Molding', rateGroup: 'Trim & Molding', unit: 'lnft', defaultCoats: 2, rateCoat1: 60, rateCoat2: 70, rateCoat3: 80, rateCoat4: 80, useMultipliers: true, sortOrder: 2 },
  { id: 'sr_doortrim', name: 'Door Trim', rateGroup: 'Trim & Molding', unit: 'lnft', defaultCoats: 2, rateCoat1: 40, rateCoat2: 50, rateCoat3: 60, rateCoat4: 60, useMultipliers: true, sortOrder: 3 },
  { id: 'sr_windowtrim', name: 'Window Trim', rateGroup: 'Trim & Molding', unit: 'lnft', defaultCoats: 2, rateCoat1: 40, rateCoat2: 50, rateCoat3: 60, rateCoat4: 60, useMultipliers: true, sortOrder: 4 },
  // Cabinets
  { id: 'sr_cabdoors', name: 'Cabinet Doors', rateGroup: 'Cabinets', unit: 'each', defaultCoats: 2, rateCoat1: 0.45, rateCoat2: 0.5, rateCoat3: 0.55, rateCoat4: 0.55, useMultipliers: false, sortOrder: 1 },
  { id: 'sr_cabinets', name: 'Standard Cabinets', rateGroup: 'Cabinets', unit: 'sqft', defaultCoats: 2, rateCoat1: 25, rateCoat2: 30, rateCoat3: 35, rateCoat4: 35, useMultipliers: false, sortOrder: 2 },
];

export const areaTemplates: AreaTemplate[] = [
  { id: 'at_living', name: 'Living Room', estimateTypeId: 'et_interior', surfaceRateIds: ['sr_stdwalls', 'sr_ceiling', 'sr_baseboard', 'sr_doortrim'], sortOrder: 1 },
  { id: 'at_bedroom', name: 'Bedroom', estimateTypeId: 'et_interior', surfaceRateIds: ['sr_stdwalls', 'sr_ceiling', 'sr_baseboard', 'sr_windowtrim'], sortOrder: 2 },
  { id: 'at_kitchen', name: 'Kitchen', estimateTypeId: 'et_interior', surfaceRateIds: ['sr_stdwalls', 'sr_ceiling', 'sr_baseboard'], sortOrder: 3 },
  { id: 'at_bath', name: 'Bathroom', estimateTypeId: 'et_interior', surfaceRateIds: ['sr_stdwalls', 'sr_ceiling', 'sr_doortrim'], sortOrder: 4 },
  { id: 'at_front', name: 'Front Elevation', estimateTypeId: 'et_exterior', surfaceRateIds: ['sr_siding', 'sr_windowtrim', 'sr_doortrim'], sortOrder: 5 },
  { id: 'at_rear', name: 'Rear Elevation', estimateTypeId: 'et_exterior', surfaceRateIds: ['sr_siding', 'sr_windowtrim'], sortOrder: 6 },
  { id: 'at_sides', name: 'Side Elevations', estimateTypeId: 'et_exterior', surfaceRateIds: ['sr_siding', 'sr_stucco'], sortOrder: 7 },
  { id: 'at_trimext', name: 'Fascia & Soffits', estimateTypeId: 'et_exterior', surfaceRateIds: ['sr_crown'], sortOrder: 8 },
  { id: 'at_uppercab', name: 'Upper Cabinets', estimateTypeId: 'et_cabinets', surfaceRateIds: ['sr_cabdoors', 'sr_cabinets'], sortOrder: 9 },
  { id: 'at_lowercab', name: 'Lower Cabinets', estimateTypeId: 'et_cabinets', surfaceRateIds: ['sr_cabdoors', 'sr_cabinets'], sortOrder: 10 },
  { id: 'at_island', name: 'Island', estimateTypeId: 'et_cabinets', surfaceRateIds: ['sr_cabinets'], sortOrder: 11 },
];

export const estimateTemplates: EstimateTemplate[] = [
  {
    id: 'tpl_interior', name: 'Standard Interior Repaint', description: 'Basic interior painting template with common room types',
    estimateTypeId: 'et_interior', areaTemplateIds: ['at_living', 'at_bedroom', 'at_kitchen', 'at_bath'], lineItemTemplateIds: [],
    termsId: 'tc_standard', defaultPaintProductId: 'pp_emerald', profitMargin: 20, isDefault: true, createdAt: T, updatedAt: T,
  },
  {
    id: 'tpl_exterior', name: 'Standard Exterior Repaint', description: 'Basic exterior painting template',
    estimateTypeId: 'et_exterior', areaTemplateIds: ['at_front', 'at_rear', 'at_sides', 'at_trimext'], lineItemTemplateIds: [],
    termsId: 'tc_standard', defaultPaintProductId: 'pp_duration', profitMargin: 20, isDefault: false, createdAt: T, updatedAt: T,
  },
  {
    id: 'tpl_cabinets', name: 'Kitchen Cabinet Refinish', description: 'Standard kitchen cabinet refinishing template',
    estimateTypeId: 'et_cabinets', areaTemplateIds: ['at_uppercab', 'at_lowercab', 'at_island'], lineItemTemplateIds: [],
    termsId: 'tc_cabinet', defaultPaintProductId: 'pp_advance', profitMargin: 25, isDefault: false, createdAt: T, updatedAt: T,
  },
];

export const packageTemplates: PackageTemplate[] = [
  { id: 'pkg_good', name: 'Good', description: 'Quality paint, one finish coat, standard prep.', tier: 'Good', paintProductId: 'pp_superpaint', priceAdjustment: 0, features: ['1 finish coat', 'Standard prep', '1-year warranty'] },
  { id: 'pkg_better', name: 'Better', description: 'Premium paint, two coats, full prep.', tier: 'Better', paintProductId: 'pp_emerald', priceAdjustment: 12, features: ['2 finish coats', 'Full prep & caulk', '3-year warranty'] },
  { id: 'pkg_best', name: 'Best', description: 'Top-tier paint, two coats plus primer, detailed prep.', tier: 'Best', paintProductId: 'pp_aura', priceAdjustment: 25, features: ['Primer + 2 coats', 'Detailed prep & repairs', '5-year warranty'] },
];

export const brands: Brand[] = [
  { id: 'br_sw', name: 'Sherwin-Williams', isCustom: true, sortOrder: 1 },
  { id: 'br_bm', name: 'Benjamin Moore', isCustom: false, sortOrder: 2 },
  { id: 'br_behr', name: 'Behr', isCustom: false, sortOrder: 3 },
  { id: 'br_ppg', name: 'PPG', isCustom: false, sortOrder: 4 },
  { id: 'br_valspar', name: 'Valspar', isCustom: false, sortOrder: 5 },
  { id: 'br_dunn', name: 'Dunn-Edwards', isCustom: true, sortOrder: 6 },
];

export const paintProducts: PaintProduct[] = [
  { id: 'pp_emerald', name: 'Emerald Urethane', brandId: 'br_sw', category: 'Paint', finish: 'Matte', coverageCoat1: 350, coverageCoat2: 400, pricePerGallon: 92, pricePer5Gallon: 430, isActive: true, isFavorite: true,
    colors: [{ name: 'Alabaster', code: 'SW 7008', hex: '#EDEAE0' }, { name: 'Agreeable Gray', code: 'SW 7029', hex: '#D1CBC1' }, { name: 'Tricorn Black', code: 'SW 6258', hex: '#2F2F30' }] },
  { id: 'pp_duration', name: 'Duration Exterior', brandId: 'br_sw', category: 'Paint', finish: 'Satin', coverageCoat1: 300, coverageCoat2: 350, pricePerGallon: 84, pricePer5Gallon: 395, isActive: true, isFavorite: false,
    colors: [{ name: 'Pure White', code: 'SW 7005', hex: '#EDECE6' }, { name: 'Naval', code: 'SW 6244', hex: '#2F3D4C' }] },
  { id: 'pp_superpaint', name: 'SuperPaint Interior', brandId: 'br_sw', category: 'Paint', finish: 'Eggshell', coverageCoat1: 350, coverageCoat2: 400, pricePerGallon: 68, pricePer5Gallon: 320, isActive: true, isFavorite: false },
  { id: 'pp_primer', name: 'Multi-Purpose Primer', brandId: 'br_sw', category: 'Primer', finish: 'Flat', coverageCoat1: 300, coverageCoat2: 350, pricePerGallon: 42, pricePer5Gallon: 195, isActive: true, isFavorite: false },
  { id: 'pp_aura', name: 'Aura Interior', brandId: 'br_bm', category: 'Paint', finish: 'Eggshell', coverageCoat1: 400, coverageCoat2: 450, pricePerGallon: 99, isActive: true, isFavorite: true,
    colors: [{ name: 'Chantilly Lace', code: 'OC-65', hex: '#F4F3EE' }, { name: 'Hale Navy', code: 'HC-154', hex: '#3E4450' }] },
  { id: 'pp_regal', name: 'Regal Select', brandId: 'br_bm', category: 'Paint', finish: 'Semi-Gloss', coverageCoat1: 375, coverageCoat2: 425, pricePerGallon: 78, isActive: true, isFavorite: false },
  { id: 'pp_advance', name: 'ADVANCE Cabinet', brandId: 'br_bm', category: 'Paint', finish: 'Satin', coverageCoat1: 350, coverageCoat2: 400, pricePerGallon: 88, isActive: true, isFavorite: false },
  { id: 'pp_arborcoat', name: 'Arborcoat Stain', brandId: 'br_bm', category: 'Stain', finish: 'Flat', coverageCoat1: 250, coverageCoat2: 300, pricePerGallon: 72, isActive: true, isFavorite: false },
  { id: 'pp_marquee', name: 'Marquee Interior', brandId: 'br_behr', category: 'Paint', finish: 'Eggshell', coverageCoat1: 350, coverageCoat2: 400, pricePerGallon: 55, isActive: true, isFavorite: false },
  { id: 'pp_ppgtimeless', name: 'Timeless Exterior', brandId: 'br_ppg', category: 'Paint', finish: 'Flat', coverageCoat1: 325, coverageCoat2: 375, pricePerGallon: 60, isActive: false, isFavorite: false },
];

export const materials: Material[] = [
  { id: 'mat_tape', name: 'Painters Tape 1.5"', category: 'Masking', unit: 'roll', unitCost: 6.5, isFavorite: true, sortOrder: 1 },
  { id: 'mat_plastic', name: 'Plastic Sheeting 9x400', category: 'Masking', unit: 'roll', unitCost: 24, isFavorite: false, sortOrder: 2 },
  { id: 'mat_dropcloth', name: 'Canvas Drop Cloth 9x12', category: 'Masking', unit: 'each', unitCost: 18, isFavorite: false, sortOrder: 3 },
  { id: 'mat_caulk', name: 'Painters Caulk', category: 'Caulk & Patch', unit: 'tube', unitCost: 4.25, isFavorite: true, sortOrder: 4 },
  { id: 'mat_spackle', name: 'Lightweight Spackle', category: 'Caulk & Patch', unit: 'quart', unitCost: 9.5, isFavorite: false, sortOrder: 5 },
  { id: 'mat_sandpaper', name: 'Sanding Sponge', category: 'Sundries', unit: 'each', unitCost: 3.75, isFavorite: false, sortOrder: 6 },
  { id: 'mat_roller', name: 'Roller Cover 9" 3/8 nap', category: 'Sundries', unit: 'each', unitCost: 7.25, isFavorite: false, sortOrder: 7 },
  { id: 'mat_brush', name: '2.5" Angled Brush', category: 'Sundries', unit: 'each', unitCost: 16, isFavorite: false, sortOrder: 8 },
  { id: 'mat_rags', name: 'Shop Rags (bag)', category: 'Sundries', unit: 'bag', unitCost: 12, isFavorite: false, sortOrder: 9 },
  { id: 'mat_mineral', name: 'Mineral Spirits', category: 'Solvents', unit: 'gallon', unitCost: 15, isFavorite: false, sortOrder: 10 },
];

export const lineItemTemplates: LineItemTemplate[] = [
  { id: 'li_prep', name: 'Surface Preparation', description: 'Scrape, sand, patch and caulk as needed.', itemType: 'PRICED', calculationType: 'FLAT_PRICE', defaultValue: 250, sortOrder: 1 },
  { id: 'li_pw', name: 'Pressure Washing', description: 'Wash all exterior surfaces before painting.', itemType: 'PRICED', calculationType: 'FLAT_PRICE', defaultValue: 350, sortOrder: 2 },
  { id: 'li_furniture', name: 'Furniture Moving', description: 'Move and cover furniture; return to place.', itemType: 'PRICED', calculationType: 'FLAT_PRICE', defaultValue: 150, sortOrder: 3 },
  { id: 'li_drywall', name: 'Drywall Repair', description: 'Minor drywall repairs up to 1 sq ft each.', itemType: 'PRICED', calculationType: 'FLAT_PRICE', defaultValue: 75, sortOrder: 4 },
  { id: 'li_cleanup', name: 'Daily Cleanup', description: 'Work area cleaned at the end of each day.', itemType: 'DESCRIPTIVE', sortOrder: 5 },
  { id: 'li_color', name: 'Color Consultation', description: 'One-hour color consult with our designer.', itemType: 'PRICED', calculationType: 'FLAT_PRICE', defaultValue: 95, sortOrder: 6 },
  { id: 'li_rush', name: 'Rush Fee', description: 'Priority scheduling within 7 days.', itemType: 'PRICED', calculationType: 'PERCENT', defaultValue: 10, sortOrder: 7 },
];

export const termsConditions: TermsCondition[] = [
  {
    id: 'tc_standard', name: 'Standard Terms', isDefault: true, createdAt: T, updatedAt: T,
    content:
      'PAYMENT TERMS\nA deposit of 30% is due at signing. The balance is due on completion.\n\nSCOPE\nWork includes only the areas and surfaces listed in this estimate. Extra work requires a signed change order.\n\nWARRANTY\nWe warranty our labor for 2 years against peeling, blistering and flaking.\n\nCANCELLATION\nCancellations within 48 hours of the start date may forfeit the deposit.',
  },
  {
    id: 'tc_cabinet', name: 'Cabinet Refinishing Terms', isDefault: false, createdAt: T, updatedAt: T,
    content:
      'Cabinet doors and drawers are removed and finished off-site. Allow 5-7 business days. Hardware is reinstalled unless new hardware is supplied. A 50% deposit is required.',
  },
  {
    id: 'tc_commercial', name: 'Commercial Terms', isDefault: false, createdAt: T, updatedAt: T,
    content: 'Net 30 payment terms. Certificate of insurance provided on request. After-hours work billed at 1.5x.',
  },
];
