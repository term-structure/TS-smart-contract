# Term Structure Contracts Diamond

## Get Started

## Test

You need Node.js 16+ to build. Use [nvm](https://github.com/nvm-sh/nvm) to install it.

Clone this repository, install Node.js dependencies, and build the source code:

```bash
git clone git@gitlab.com:tkspring/term-structure-contracts-diamond.git
npm i
npm run build
```

Run all the test cases:

1. Create `.env` file based on `.env.example` and set `MAINNET_RPC_URL` for mainnet fork testing

```bash
npm run test
```

## Deployment

### Local

1. Run hardhat node

```bash
npm run start
```

2. Deploy Term Structure protocol on local

```bash
npm run deploy:local
```

### Devnet/Testnet/Mainnet

1. Create `.env` file based on `.env.example` and set all `devnet/testnet/mainnet config`

2. Set network config in `hardhat.config.ts`
3. Deploy to devnet/testnet/mainnet

```bash
npm run deploy:devnet
npm run deploy:testnet
npm run deploy:mainnet
```
