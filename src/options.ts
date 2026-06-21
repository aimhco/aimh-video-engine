export function captionsEnabledFromArgs(args: string[]): boolean {
  return args.includes("--captions") || args.includes("--with-captions");
}
