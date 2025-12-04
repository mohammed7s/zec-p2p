const express = require('express');
const cors = require('cors');
const { PrimusZKTLS } = require('@primuslabs/zktls-js-sdk');

const app = express();
const port = 9000;

// Just for test, developers can modify it.
app.use(cors()); 

// Listen to the client's signature request and sign the attestation request.
app.get('/primus/sign', async (req, res) => {
  // zcash-p2p Project credentials
  const appId = "0xb10c6f1df137ca3197504429ccd2843c0bce2196";
  const appSecret= "0xfc814c7fc135ec619149a4ea56847973aa1f0923cd226cc07c50a9d12708b2f2";

  // Create a PrimusZKTLS object.
  const primusZKTLS = new PrimusZKTLS();

  // Set appId and appSecret through the initialization function.
  await primusZKTLS.init(appId, appSecret);

  // Sign the attestation request.
  console.log("signParams=", req.query.signParams);
  const signResult = await primusZKTLS.sign(req.query.signParams);
  console.log("signResult=", signResult);

  // Return signed result.
  res.json({signResult});
});

app.listen(port, () => {
  console.log(`Server is running at http://0.0.0.0:${port}`);
});
