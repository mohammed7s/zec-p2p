import { keccak_256 } from "@noble/hashes/sha3";

export function padTo(arr: number[], target: number): number[] {
  if (arr.length > target) throw new Error(`too long: ${arr.length} > ${target}`);
  return arr.concat(Array(target - arr.length).fill(0));
}

export function encodePacked(publicData: any): number[] {
  const out: number[] = [];

  out.push(...Buffer.from(publicData.recipient.slice(2), "hex"));

  if (Array.isArray(publicData.request)) {
    const requestConcat = publicData.request
      .map((req: any) => req.url + req.header + req.method + req.body)
      .join("");
    out.push(...keccak_256(Buffer.from(requestConcat, "utf8")));
  } else {
    const req = publicData.request;
    out.push(...keccak_256(Buffer.from(req.url + req.header + req.method + req.body, "utf8")));
  }

  if (Array.isArray(publicData.responseResolves)) {
    const responseConcat = publicData.responseResolves
      .flatMap((r: any) => r.oneUrlResponseResolve)
      .map((rr: any) => rr.keyName + rr.parseType + rr.parsePath)
      .join("");
    out.push(...keccak_256(Buffer.from(responseConcat, "utf8")));
  } else {
    const rr = publicData.responseResolves.oneUrlResponseResolve[0];
    out.push(...keccak_256(Buffer.from(rr.keyName + rr.parseType + rr.parsePath, "utf8")));
  }

  out.push(...Buffer.from(publicData.data, "utf8"));
  out.push(...Buffer.from(publicData.attConditions, "utf8"));

  const buf = Buffer.alloc(8);
  buf.writeBigUInt64BE(BigInt(publicData.timestamp));
  out.push(...buf);

  out.push(...Buffer.from(publicData.additionParams, "utf8"));

  return out;
}
