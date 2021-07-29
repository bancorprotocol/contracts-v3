import { ethers } from 'hardhat';
import { ContractFactory } from '@ethersproject/contracts';
import { Signer } from '@ethersproject/abstract-signer';

import {
    BancorNetwork__factory,
    BancorVault__factory,
    ERC20__factory,
    LiquidityPoolCollection__factory,
    NetworkSettings__factory,
    NetworkTokenPool__factory,
    PendingWithdrawals__factory,
    PoolToken__factory,
    ProxyAdmin__factory,
    TestBancorNetwork__factory,
    TestERC20Burnable__factory,
    TestERC20Token__factory,
    TestFormula__factory,
    TestLiquidityPoolCollection__factory,
    TestMathEx__factory,
    TestOwnedUpgradeable__factory,
    TestReserveToken__factory,
    TestSafeERC20Ex__factory,
    TokenHolderUpgradeable__factory,
    TransparentUpgradeableProxy__factory
} from 'typechain';

type AsyncReturnType<T extends (...args: any) => any> = T extends (...args: any) => Promise<infer U>
    ? U
    : T extends (...args: any) => infer U
    ? U
    : any;

export type Contract<F extends ContractFactory> = AsyncReturnType<F['deploy']>;

export interface ContractBuilder<F extends ContractFactory> {
    contractName: string;
    deploy(...args: Parameters<F['deploy']>): Promise<Contract<F>>;
    attach(address: string, passedSigner?: Signer): Promise<Contract<F>>;
}

const deployOrAttach = <F extends ContractFactory>(contractName: string, passedSigner?: Signer): ContractBuilder<F> => {
    return {
        contractName,
        deploy: async (...args: Parameters<F['deploy']>): Promise<Contract<F>> => {
            let defaultSigner = passedSigner ? passedSigner : (await ethers.getSigners())[0];

            return (await ethers.getContractFactory(contractName, defaultSigner)).deploy(
                ...(args || [])
            ) as Contract<F>;
        },
        attach: attachOnly<F>(contractName).attach
    };
};

const attachOnly = <F extends ContractFactory>(contractName: string, passedSigner?: Signer) => {
    return {
        attach: async (address: string, signer?: Signer): Promise<Contract<F>> => {
            let defaultSigner = passedSigner ? passedSigner : (await ethers.getSigners())[0];
            return ethers.getContractAt(contractName, address, signer || defaultSigner) as Contract<F>;
        }
    };
};

const getContracts = (signer?: Signer) => ({
    connect: (signer: Signer) => getContracts(signer),

    BancorNetwork: deployOrAttach<BancorNetwork__factory>('BancorNetwork', signer),
    BancorVault: deployOrAttach<BancorVault__factory>('BancorVault', signer),
    ERC20: deployOrAttach<ERC20__factory>('ERC20', signer),
    LiquidityPoolCollection: deployOrAttach<LiquidityPoolCollection__factory>('LiquidityPoolCollection', signer),
    NetworkSettings: deployOrAttach<NetworkSettings__factory>('NetworkSettings', signer),
    NetworkTokenPool: deployOrAttach<NetworkTokenPool__factory>('NetworkTokenPool', signer),
    PendingWithdrawals: deployOrAttach<PendingWithdrawals__factory>('PendingWithdrawals', signer),
    PoolToken: deployOrAttach<PoolToken__factory>('PoolToken', signer),
    ProxyAdmin: deployOrAttach<ProxyAdmin__factory>('ProxyAdmin', signer),
    TestBancorNetwork: deployOrAttach<TestBancorNetwork__factory>('TestBancorNetwork', signer),
    TestERC20Token: deployOrAttach<TestERC20Token__factory>('TestERC20Token', signer),
    TestERC20Burnable: deployOrAttach<TestERC20Burnable__factory>('TestERC20Burnable', signer),
    TestFormula: deployOrAttach<TestFormula__factory>('TestFormula', signer),
    TestLiquidityPoolCollection: deployOrAttach<TestLiquidityPoolCollection__factory>('TestLiquidityPoolCollection', signer),
    TestMathEx: deployOrAttach<TestMathEx__factory>('TestMathEx', signer),
    TestOwnedUpgradeable: deployOrAttach<TestOwnedUpgradeable__factory>('TestOwnedUpgradeable', signer),
    TestReserveToken: deployOrAttach<TestReserveToken__factory>('TestReserveToken', signer),
    TestSafeERC20Ex: deployOrAttach<TestSafeERC20Ex__factory>('TestSafeERC20Ex', signer),
    TokenHolderUpgradeable: deployOrAttach<TokenHolderUpgradeable__factory>('TokenHolderUpgradeable', signer),
    TransparentUpgradeableProxy: deployOrAttach<TransparentUpgradeableProxy__factory>(
        'TransparentUpgradeableProxy',
        signer
    )
});

export default getContracts();
