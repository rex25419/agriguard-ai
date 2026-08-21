import fs from "fs";
const addrsPath = new URL("../contracts/deployed-addresses.json", import.meta.url);
try {
  const addrs = JSON.parse(fs.readFileSync(addrsPath, "utf8"));
  console.log(addrs.riskOracleAddress);
} catch (e) {
  console.error("Error:", e);
}
