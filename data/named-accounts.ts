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
        ...mainnet('0xb527a981e1d415AF696936B3174f2d7aC8D11369')
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
        ...mainnet('0x6daB3bCbFb336b29d06B9C793AEF7eaA57888922')
    }
};

const TokenNamedAccounts = {
    dai: {
        ...mainnet('0x60FaAe176336dAb62e284Fe19B885B095d29fB7F')
    },
    link: {
        ...mainnet('0x0757e27AC1631beEB37eeD3270cc6301dD3D57D4')
    },
    weth: {
        ...mainnet('0x741AA7CFB2c7bF2A1E7D4dA2e3Df6a56cA4131F3')
    },
    usdc: {
        ...mainnet('0x51eDF02152EBfb338e03E30d65C15fBf06cc9ECC')
    },
    wbtc: {
        ...mainnet('0x6daB3bCbFb336b29d06B9C793AEF7eaA57888922')
    }
};

const UniswapNamedAccounts = {
    uniswapV3Router: { ...mainnet('0xE592427A0AEce92De3Edee1F18E0157C05861564') },
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
