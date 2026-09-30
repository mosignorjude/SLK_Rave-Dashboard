export function sortUsersByRegistrationDate<T extends { uid?: string; createdAt?: unknown }>(users: T[]): T[];
