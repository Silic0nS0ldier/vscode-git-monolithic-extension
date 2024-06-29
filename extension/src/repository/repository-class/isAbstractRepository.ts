import type { AbstractRepository } from "./AbstractRepository.js";

export const AbstractRepositorySymbol = Symbol();

export function isAbstractRepository(value: unknown): value is AbstractRepository {
    return (value as any).__type === AbstractRepositorySymbol;
}
