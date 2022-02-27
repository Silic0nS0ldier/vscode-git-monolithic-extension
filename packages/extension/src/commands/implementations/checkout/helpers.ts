import { workspace } from "vscode";
import { Ref, RefType } from "../../../api/git.js";
import { FinalRepository } from "../../../repository/repository-class/mod.js";
import { CheckoutItem, CheckoutRemoteHeadItem, CheckoutTagItem } from "./quick-pick.js";

export function createCheckoutItems(repository: FinalRepository): CheckoutItem[] {
    const config = workspace.getConfiguration("git");
    const checkoutTypeConfig = config.get<string | string[]>("checkoutType");
    let checkoutTypes: string[];

    if (checkoutTypeConfig === "all" || !checkoutTypeConfig || checkoutTypeConfig.length === 0) {
        checkoutTypes = ["local", "remote", "tags"];
    } else if (typeof checkoutTypeConfig === "string") {
        checkoutTypes = [checkoutTypeConfig];
    } else {
        checkoutTypes = checkoutTypeConfig;
    }

    const processors = checkoutTypes.map(getCheckoutProcessor)
        .filter(p => !!p) as CheckoutProcessor[];

    for (const ref of repository.refs) {
        for (const processor of processors) {
            processor.onRef(ref);
        }
    }

    return processors.reduce<CheckoutItem[]>((r, p) => r.concat(...p.items), []);
}

function getCheckoutProcessor(type: string): CheckoutProcessor | undefined {
    switch (type) {
        case "local":
            return new CheckoutProcessor(RefType.Head, CheckoutItem);
        case "remote":
            return new CheckoutProcessor(RefType.RemoteHead, CheckoutRemoteHeadItem);
        case "tags":
            return new CheckoutProcessor(RefType.Tag, CheckoutTagItem);
    }

    return undefined;
}

class CheckoutProcessor {
    private refs: Ref[] = [];
    get items(): CheckoutItem[] {
        return this.refs.map(r => new this.ctor(r));
    }
    constructor(private type: RefType, private ctor: { new(ref: Ref): CheckoutItem }) {}

    onRef(ref: Ref): void {
        if (ref.type === this.type) {
            this.refs.push(ref);
        }
    }
}
