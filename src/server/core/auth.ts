import { context } from '../devvitProxy/index.ts';

export function getCurrentUserId(): string {
  const userId = context.userId;
  if (!userId) {
    throw new Error('UNAUTHORIZED: No valid Reddit identity detected.');
  }
  return userId;
}

export function verifyOwnership(ownerId: string): void {
  const userId = getCurrentUserId();
  if (userId !== ownerId) {
    throw new Error('FORBIDDEN: No tienes permisos sobre este recurso.');
  }
}
