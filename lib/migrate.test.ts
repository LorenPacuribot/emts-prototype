import { describe, expect, it } from 'vitest';
import type { TableColumn } from './types';
import { tableColumns } from './data/settings-config';
import { addMissingById, migrateTableColumns } from './migrate';

describe('saved data migration', () => {
  it('adds new table columns in seed order and keeps the user’s choices', () => {
    const old: TableColumn[] = [
      { id: 'tcol_surface', name: 'Surface', columnType: 'SYSTEM', isVisible: true, isSystem: true, sortOrder: 1 },
      { id: 'tcol_wash', name: 'Pressure Wash', columnType: 'CHECKBOX', isVisible: true, isSystem: false, sortOrder: 2 },
      { id: 'custom_1', name: 'Wallpaper removal', columnType: 'HOURS', unit: 'hr', isVisible: true, isSystem: false, sortOrder: 3 },
    ];
    const next = migrateTableColumns(old, tableColumns);
    expect(next.map((c) => c.id)).toEqual([...[...tableColumns].sort((a, b) => a.sortOrder - b.sortOrder).map((c) => c.id), 'custom_1']);
    const surface = next.find((c) => c.id === 'tcol_surface')!;
    expect(surface.name).toBe('Surface');
    const wash = next.find((c) => c.id === 'tcol_wash')!;
    // Renamed and shown by the user; gets the seeded prep rate it never had.
    expect(wash).toMatchObject({ name: 'Pressure Wash', isVisible: true, prepRate: 600 });
    expect(next.map((c) => c.sortOrder)).toEqual(next.map((_, i) => i + 1));
  });

  it('adds seeded rows that a save is missing, without touching saved ones', () => {
    const saved = [{ id: 'a', v: 1 }];
    expect(addMissingById(saved, [{ id: 'a', v: 2 }, { id: 'b', v: 3 }])).toEqual([{ id: 'a', v: 1 }, { id: 'b', v: 3 }]);
    expect(addMissingById(saved, [{ id: 'a', v: 2 }])).toBe(saved);
  });
});
