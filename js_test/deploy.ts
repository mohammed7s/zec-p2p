import fs from "fs";
import { AttVerifierContract } from "./bindings/AttVerifier.js";
import { getInitialTestAccountsData } from "@aztec/accounts/testing";
import { TestWallet } from "@aztec/test-wallet/server";
import { BusinessProgramContract } from "./bindings/BusinessProgram.js";
import { createAztecNodeClient } from "@aztec/aztec.js/node";
import { getPXEConfig } from "@aztec/pxe/server";
import { poseidon2Hash } from "@aztec/foundation/crypto";


// Allow Revolut transactions endpoint for this run
const AllOWED_URL = [
  "https://app.revolut.com/api/retail/user/current/transactions/last?count=20&internalPocketId=24e2e5ad-b4f4-4d3b-ac68-0dbd75e021d1",
];

const node = createAztecNodeClient("http://localhost:8080");
const config = getPXEConfig();
config.proverEnabled = true;
const wallet = await TestWallet.create(node, config);
const [aliceAccount] = await getInitialTestAccountsData();
let alice = await wallet.createSchnorrAccount(aliceAccount.secret, aliceAccount.salt);

// deploy attVerifierContract
const attVerifierContract = await AttVerifierContract.deploy(wallet).send({ from: aliceAccount.address })
  .deployed();
console.log("deployed attverifier");

// prepare allowed urls
const allowedUrls: (bigint | number)[][] = [];
for (const url of AllOWED_URL) {
  const url_bytes = Array.from(new TextEncoder().encode(url));
  allowedUrls.push(url_bytes)
}
const hashedUrls: bigint[] = [];
for (let url of allowedUrls) {
  url = url.slice();
  // pad with zeros to length 1024
  while (url.length < 1024) {
    url.push(0);
  }

  const frArray = url.map(b => BigInt(b));
  const hashFr = await poseidon2Hash(frArray);
  const hashBigInt = hashFr.toBigInt ? hashFr.toBigInt() : BigInt(hashFr.toString());
  hashedUrls.push(hashBigInt);
}
console.log("Deploy hashedUrls:", hashedUrls.map(h => "0x" + h.toString(16)));

// deploy business program
const businessProgram = await BusinessProgramContract.deploy(wallet, alice.address, hashedUrls)
  .send({ from: aliceAccount.address }) // testAccount has fee juice and is registered in the deployer_wallet
  .deployed();
console.log("deployed business program");

// save contract instance info to a JSON file
const instanceInfos = {
  attVerifierContract: {
    constructorArgs: [],
    salt: attVerifierContract.instance.salt,
    deployer: attVerifierContract.instance.deployer,
  },
  businessProgram: {
    constructorArgs: [alice.address, hashedUrls.map((value => `0x${value.toString(16)}`))],
    salt: businessProgram.instance.salt,
    deployer: businessProgram.instance.deployer,
  }
};
const json = JSON.stringify(instanceInfos, null, 2);
fs.writeFileSync("deployed_contract.json", json, "utf-8");
console.log("Saved to eployed_contract.json");
