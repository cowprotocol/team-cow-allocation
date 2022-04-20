interface Stringable {
  toString: () => string;
}

export function customError(name: string, ...args: Stringable[]) {
  return `reverted with custom error '${name}(${args
    .map((a) => a.toString())
    .join(", ")})'`;
}

export enum RevertMessage {
  MockRevert = "Mock revert",
  UninitializedMock = "Mock on the method is not initialized",
}
