// Runtime helpers around the generated entity registry.
import entitiesJson from '../data/entities.json';

export interface Entity {
  id: string;
  type: string;
  slug: string;
  name: string;
  icon: string | null;
  page: string | null;
  group?: string | null;
}

export const entities: Entity[] = (entitiesJson as any).entities;

const byId = new Map(entities.map((e) => [e.id, e]));

export function getEntity(id: string): Entity | undefined {
  return byId.get(id);
}

export function getEntityBySlug(type: string, slug: string): Entity | undefined {
  return entities.find((e) => e.type === type && e.slug === slug);
}
