import { DeploymentNetwork } from '../utils/Constants';

const mainnet = (address: string) => ({
    [DeploymentNetwork.Mainnet]: address,
    [DeploymentNetwork.Tenderly]: address
});

const rinkeby = (address: string) => ({
    [DeploymentNetwork.Rinkeby]: address
});

const TestNamedAccounts = {
    ethWhale: {
        ...mainnet('0xDA9dfA130Df4dE4673b89022EE50ff26f6EA73Cf')
    },
    daiWhale: {
        ...mainnet('0xe35A2a4586dc6C01D00E3458c9F15104DE9755D9')
    },
    linkWhale: {
        ...mainnet('0xc6bed363b30DF7F35b601a5547fE56cd31Ec63DA')
    },
    bntWhale: {
        ...mainnet('0xA744a64Dfd51e4feE3360f1EC1509D329047d7db')
    },
    usdcWhale: {
        ...mainnet('0x55FE002aefF02F77364de339a1292923A15844B8')
    },
    wbtcWhale: {
        ...mainnet('0x218B95BE3ed99141b0144Dba6cE88807c4AD7C09')
    }
};

const TokenNamedAccounts = {
    dai: {
        ...mainnet('0x6B175474E89094C44Da98b954EedeAC495271d0F')
    },
    link: {
        ...mainnet('0x514910771AF9Ca656af840dff83E8264EcF986CA')
    },
    weth: {
        ...mainnet('0xC02aaA39b223FE8D0A0e5C4F27eAD9083C756Cc2')
    },
    usdc: {
        ...mainnet('0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48')
    },
    wbtc: {
        ...mainnet('0x2260FAC5E5542a773Aa44fBCfeDf7C193bc2C599')
    }
};

const UniswapNamedAccounts = {
    uniswapV2Router02: { ...mainnet('0x7a250d5630B4cF539739dF2C5dAcb4c659F2488D') },
    uniswapV2Factory: { ...mainnet('0x5C69bEe701ef814a2B6a3EDD4B1652CB9cc5aA6f') }
};

const SushiSwapNamedAccounts = {
    sushiSwapRouter: { ...mainnet('0xd9e1cE17f2641f24aE83637ab66a2cca9C378B9F') },
    sushiSwapFactory: { ...mainnet('0xC0AEe478e3658e2610c5F7A4A2E1777cE9e4f2Ac') }
};

export const NamedAccounts = {
    deployer: {
        ...mainnet('ledger://0x5bEBA4D3533a963Dedb270a95ae5f7752fA0Fe22'),
        ...rinkeby('ledger://0x0f28D58c00F9373C00811E9576eE803B4eF98abe')
    },
    deployerV2: { ...mainnet('0xdfeE8DC240c6CadC2c7f7f9c257c259914dEa84E') },
    foundationMultisig: { ...mainnet('0xeBeD45Ca22fcF70AdCcAb7618C51A3Dbb06C8d83') },
    foundationMultisig2: { ...mainnet('0x0c333d48Af19c2b42577f3C8f4779F0347F8C819') },
    daoMultisig: { ...mainnet('0x7e3692a6d8c34a762079fa9057aed87be7e67cb8') },
    daoPauserMultisig: { ...mainnet('0xc140c1CD2e587fC04DAa780d49b616F768476660') },

    ...TokenNamedAccounts,
    ...TestNamedAccounts,
    ...UniswapNamedAccounts,
    ...SushiSwapNamedAccounts
};
