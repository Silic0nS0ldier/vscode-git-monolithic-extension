export function timeout(millis: number) {
    return new Promise(c => setTimeout(c, millis));
}
