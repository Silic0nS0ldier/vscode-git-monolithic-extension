export interface Commit {
    hash: string;
    message: string;
    parents: string[];
    authorDate?: Date;
    authorName?: string;
    authorEmail?: string;
    commitDate?: Date;
}
