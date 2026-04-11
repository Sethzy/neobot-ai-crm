declare module "psl" {
  export interface ParsedDomain {
    domain: string | null;
    input: string;
    listed?: boolean;
    sld?: string | null;
    subdomain?: string | null;
    tld?: string | null;
  }

  export function parse(input: string): ParsedDomain;

  const psl: {
    parse: typeof parse;
  };

  export default psl;
}
