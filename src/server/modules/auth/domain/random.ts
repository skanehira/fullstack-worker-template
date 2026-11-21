/** 乱数の Port。実装は `crypto.getRandomValues` を使い、テストは固定値を渡す。 */
export type RandomBytes = (length: number) => Uint8Array;
export type RandomUint32 = () => number;
export type Random = { bytes: RandomBytes; uint32: RandomUint32 };
