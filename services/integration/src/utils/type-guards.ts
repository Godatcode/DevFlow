// Type guards and utilities for handling unknown API responses

export function isObject(value: unknown): value is Record<string, any> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

export function hasProperty<T extends string>(
  obj: unknown,
  prop: T
): obj is Record<T, unknown> {
  return isObject(obj) && prop in obj;
}

export function getStringProperty(obj: unknown, prop: string): string | undefined {
  if (hasProperty(obj, prop) && typeof obj[prop] === 'string') {
    return obj[prop];
  }
  return undefined;
}

export function getNumberProperty(obj: unknown, prop: string): number | undefined {
  if (hasProperty(obj, prop) && typeof obj[prop] === 'number') {
    return obj[prop];
  }
  return undefined;
}

export function getBooleanProperty(obj: unknown, prop: string): boolean | undefined {
  if (hasProperty(obj, prop) && typeof obj[prop] === 'boolean') {
    return obj[prop];
  }
  return undefined;
}

export function getArrayProperty(obj: unknown, prop: string): unknown[] | undefined {
  if (hasProperty(obj, prop) && Array.isArray(obj[prop])) {
    return obj[prop];
  }
  return undefined;
}