import axios from "axios";
import baseTokenConfig from "./baseTokenConfig.json";

async function main() {
  const adminConsoleUrl = "http://admin.staging.ts.finance";
  const createTsbToken = "/v1/token/createTsbToken";
  const addTsbToken = "/v1/token/addTsbToken/";
  const maturityTime = [
    1695945600,
    // 1685491200, 1688083200, 1696032000, 1703980800, 1711843200,
  ];
  for (const mt of maturityTime) {
    // for (let i = 0; i < baseTokenConfig.length; i++) {
    for (let i = 0; i < 1; i++) {
      const body: Record<string, any> = {
        base_token_id: baseTokenConfig[i].id,
        maturity_date: mt,
        collateral_enabled: true,
        deposit_enabled: true,
        enabled: true,
        primary_enabled: true,
        secondary_enabled: true,
      };
      const createUrl = adminConsoleUrl + createTsbToken;
      console.log({ createUrl, body });
      const createRes: any = await axios.post(createUrl, JSON.stringify(body), {
        headers: {
          "Content-Type": "application/json",
        },
      });
      console.log(createRes.data);
      //   const updateUrl =
      //     adminConsoleUrl + updateBondToken + createRes.data.bond_token_id;
      //   console.log({ updateUrl });
      //   const updateRes: any = await axios.put(updateUrl);
      //   console.log(updateRes.data);
    }
  }
}
main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
