import { PrimusZKTLS } from "@primuslabs/zktls-js-sdk"

// Initialize parameters.
const primusZKTLS = new PrimusZKTLS();
// zcash-p2p Project with Revolut template
const appId = "0xb10c6f1df137ca3197504429ccd2843c0bce2196";

// If it is running on a mobile terminal, you need to pass the platform parameter. The default platform is PC. If you add the following configuration, it can run on both PC and mobile terminals.
let platformDevice = "pc";
if (navigator.userAgent.toLocaleLowerCase().includes("android")) {
    platformDevice = "android";
} else if (navigator.userAgent.toLocaleLowerCase().includes("iphone")) {
    platformDevice = "ios";
}
const initAttestaionResult = await primusZKTLS.init(appId, "", {platform: platformDevice});
console.log("primusProof initAttestaionResult=", initAttestaionResult);

export async function primusProof() {
    // Set TemplateID and user address.
    const attTemplateID = "29c33c39-b81d-43b9-8868-7977cf1fe208"; // Your Revolut transfer template
    const userAddress = "0xB12a1f7035FdCBB4cC5Fa102C01346BD45439Adf"; // Recipient address for the attestation

    // Generate attestation request
    const request = primusZKTLS.generateRequestParams(attTemplateID, userAddress);

    // Set attestation conditions to verify specific Revolut transfer
    // This is the KEY difference - we're asserting specific transaction details!
    const attConditions = [
        [
            {
                type: "CONDITION",
                op: "STREQ",           // String equals
                key: "username",       // Recipient username field
                value: "optimapqfu"    // Expected recipient - CHANGE THIS
            },
            {
                type: "CONDITION",
                op: "EQ",              // Numeric equals
                key: "amount",
                value: "-10"           // Expected amount (negative = outgoing) - CHANGE THIS
            },
            {
                type: "CONDITION",
                op: "STREQ",
                key: "currency",
                value: "GBP"           // Expected currency - CHANGE THIS
            },
            {
                type: "CONDITION",
                op: "STREQ",
                key: "state",
                value: "COMPLETED"     // Must be completed
            }
        ]
    ];
    request.setAttConditions(attConditions);

    // Set tls mode, default is proxy model
    const proxyMode = "proxytls"
    request.setAttMode({
        algorithmType: proxyMode
    });

    // Transfer request object to string
    const requestStr = request.toJsonString();

    // Get signed response from backend
    const response = await fetch(`http://localhost:9000/primus/sign?signParams=${requestStr}`);
    const responseJson = await response.json();
    const signedRequestStr = responseJson.signResult;

    // Start attestation process
    const attestation = await primusZKTLS.startAttestation(signedRequestStr);
    console.log("attestation=", attestation);

    // Verify signature
    const verifyResult = await primusZKTLS.verifyAttestation(attestation)
    console.log("verifyResult=", verifyResult);

    if (verifyResult === true) {
        // Parse the attested transaction data
        const data = JSON.parse(attestation.data);

        console.log("\n✅ Verified Revolut Transfer:");
        console.log("  Amount:", data.amount, data.currency);
        console.log("  Recipient:", data.username);
        console.log("  State:", data.state);
        console.log("  Type:", data.type);
        console.log("  Completed:", new Date(parseInt(data.completedDate)).toISOString());
        console.log("  TX ID:", data.id);

        // Additional business logic validation
        if (data.state !== "COMPLETED") {
            throw new Error("Transaction not completed");
        }

        if (data.amount !== "-10" || data.currency !== "GBP") {
            throw new Error(`Amount mismatch: expected -10 GBP, got ${data.amount} ${data.currency}`);
        }

        if (data.username !== "optimapqfu") {
            throw new Error(`Recipient mismatch: expected optimapqfu, got ${data.username}`);
        }

        alert(`✅ Verified: Sent ${Math.abs(data.amount)} ${data.currency} to ${data.username}`);
        return { verified: true, data };
    } else {
        alert("❌ Attestation verification failed");
        throw new Error("Attestation verification failed");
    }
}