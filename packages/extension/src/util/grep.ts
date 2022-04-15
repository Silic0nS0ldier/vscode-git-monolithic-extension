import { createReadStream } from "node:fs";
import { toLineStream } from "./stream-by-line.js";

export async function grep(filename: string, pattern: RegExp): Promise<boolean> {
    return new Promise<boolean>((c, e) => {
        const fileStream = createReadStream(filename, { encoding: "utf8" });
        const stream = toLineStream(fileStream, { encoding: "utf8" });
        stream.on("data", (line: string) => {
            if (pattern.test(line)) {
                fileStream.close();
                c(true);
            }
        });

        stream.on("error", e);
        stream.on("end", () => c(false));
    });
}