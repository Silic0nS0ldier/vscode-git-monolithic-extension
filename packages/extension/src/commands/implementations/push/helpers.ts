export enum PushType {
	Push,
	PushTo,
	PushFollowTags,
	PushTags
}

export interface PushOptions {
	pushType: PushType;
	forcePush?: boolean;
	silent?: boolean;

	pushTo?: {
		remote?: string;
		refspec?: string;
		setUpstream?: boolean;
	}
}
