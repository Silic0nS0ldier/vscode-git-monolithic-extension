export function timeout(millis: number): Promise<void> {
    return new Promise<void>(c => setTimeout(c, millis));
}
