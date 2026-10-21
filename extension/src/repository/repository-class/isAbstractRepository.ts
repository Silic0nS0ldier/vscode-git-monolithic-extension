import type { AbstractRepository } from "./AbstractRepository.js";

export const AbstractRepositorySymbol = Symbol();

export function isAbstractRepository(value: unknown): value is AbstractRepository {
    return typeof value === "object" && value !== null && "__type" in value
        && value.__type === AbstractRepositorySymbol;
}
