export function mapBooleanFields<T extends object>(row: T): T {
  const result = { ...row };
  
  for (const key in result) {
    if (result[key] === 1) {
      result[key as keyof T] = true as unknown as T[keyof T];
    } else if (result[key] === 0) {
      result[key as keyof T] = false as unknown as T[keyof T];
    }
  }
  
  return result;
}

export function generateId(): string {
  return `${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
}

export function parseJSONField<T>(value: string | T): T {
  if (typeof value === 'string') {
    try {
      return JSON.parse(value);
    } catch {
      return value as unknown as T;
    }
  }
  return value;
}