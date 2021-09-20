/* eslint-disable camelcase */
import {
    BancorNetwork__factory,
    BancorVault__factory,
    ERC20__factory,
    NetworkSettings__factory,
    NetworkTokenPool__factory,
    PendingWithdrawals__factory,
    PoolCollection__factory,
    PoolToken__factory,
    PoolTokenFactory__factory,
    ProxyAdmin__factory,
    TestBancorNetwork__factory,
    TestERC20Burnable__factory,
    TestERC20Token__factory,
    TestMathEx__factory,
    TestNetworkTokenPool__factory,
    TestOwned__factory,
    TestPendingWithdrawals__factory,
    TestPoolAverageRate__factory,
    TestPoolCollection__factory,
    TestReserveToken__factory,
    TestSafeERC20Ex__factory,
    TestSystemToken__factory,
    TestUpgradeable__factory,
    TokenHolder__factory,
    TestTokenGovernance__factory,
    TransparentUpgradeableProxy__factory
} from '../typechain';
import {
    SmartToken__factory as BNTToken__factory,
    DSToken__factory as vBNTToken__factory,
    TokenGovernance__factory
} from '@bancor/token-governance';

/* eslint-enable camelcase */
import { Signer } from '@ethersproject/abstract-signer';
import { ContractFactory } from '@ethersproject/contracts';
import { ethers } from 'hardhat';

type AsyncReturnType<T extends (...args: any) => any> = T extends (...args: any) => Promise<infer U>
    ? U
    : T extends (...args: any) => infer U
    ? U
    : any;

export type Contract<F extends ContractFactory> = AsyncReturnType<F['deploy']>;

export interface ContractBuilder<F extends ContractFactory> {
    metadata: {
        contractName: string;
        abi: unknown;
        bytecode: string;
    };
    deploy(...args: Parameters<F['deploy']>): Promise<Contract<F>>;
    attach(address: string, signer?: Signer): Promise<Contract<F>>;
}

type FactoryConstructor<F extends ContractFactory> = { new (signer?: Signer): F; abi: unknown; bytecode: string };
const deployOrAttach = <F extends ContractFactory>(
    contractName: string,
    // @TODO: needs to replace with correctly typed params but it doesn't
    // work properly for some reason https://github.com/microsoft/TypeScript/issues/31278
    FactoryConstructor: FactoryConstructor<F>,
    initialSigner?: Signer
): ContractBuilder<F> => {
    return {
        metadata: {
            contractName: contractName,
            abi: FactoryConstructor.abi,
            bytecode: FactoryConstructor.bytecode
        },
        deploy: async (...args: Parameters<F['deploy']>): Promise<Contract<F>> => {
            const defaultSigner = initialSigner || (await ethers.getSigners())[0];

            return new FactoryConstructor(defaultSigner).deploy(...(args || [])) as Contract<F>;
        },
        attach: attachOnly<F>(FactoryConstructor, initialSigner).attach
    };
};

const attachOnly = <F extends ContractFactory>(FactoryConstructor: FactoryConstructor<F>, initialSigner?: Signer) => {
    return {
        attach: async (address: string, signer?: Signer): Promise<Contract<F>> => {
            const defaultSigner = initialSigner || (await ethers.getSigners())[0];
            return new FactoryConstructor(signer || defaultSigner).attach(address) as Contract<F>;
        }
    };
};

const getContracts = (signer?: Signer) => ({
    connect: (signer: Signer) => getContracts(signer),

    BancorNetwork: deployOrAttach('BancorNetwork', BancorNetwork__factory, signer),
    BancorVault: deployOrAttach('BancorVault', BancorVault__factory, signer),
    ERC20: deployOrAttach('ERC20', ERC20__factory, signer),
    PoolCollection: deployOrAttach('PoolCollection', PoolCollection__factory, signer),
    NetworkSettings: deployOrAttach('NetworkSettings', NetworkSettings__factory, signer),
    NetworkTokenPool: deployOrAttach('NetworkTokenPool', NetworkTokenPool__factory, signer),
    PendingWithdrawals: deployOrAttach('PendingWithdrawals', PendingWithdrawals__factory, signer),
    PoolToken: deployOrAttach('PoolToken', PoolToken__factory, signer),
    PoolTokenFactory: deployOrAttach('PoolTokenFactory', PoolTokenFactory__factory, signer),
    ProxyAdmin: deployOrAttach('ProxyAdmin', ProxyAdmin__factory, signer),
    TestBancorNetwork: deployOrAttach('TestBancorNetwork', TestBancorNetwork__factory, signer),
    TestERC20Token: deployOrAttach('TestERC20Token', TestERC20Token__factory, signer),
    TestERC20Burnable: deployOrAttach('TestERC20Burnable', TestERC20Burnable__factory, signer),
    TestPoolAverageRate: deployOrAttach('TestPoolAverageRate', TestPoolAverageRate__factory, signer),
    TestPoolCollection: deployOrAttach('TestPoolCollection', TestPoolCollection__factory, signer),
    TestNetworkTokenPool: deployOrAttach('TestNetworkTokenPool', TestNetworkTokenPool__factory, signer),
    TestMathEx: deployOrAttach('TestMathEx', TestMathEx__factory, signer),
    TestOwned: deployOrAttach('TestOwned', TestOwned__factory, signer),
    TestPendingWithdrawals: deployOrAttach('TestPendingWithdrawals', TestPendingWithdrawals__factory, signer),
    TestReserveToken: deployOrAttach('TestReserveToken', TestReserveToken__factory, signer),
    TestSafeERC20Ex: deployOrAttach('TestSafeERC20Ex', TestSafeERC20Ex__factory, signer),
    TestSystemToken: deployOrAttach('TestSystemToken', TestSystemToken__factory, signer),
    TestUpgradeable: deployOrAttach('TestUpgradeable', TestUpgradeable__factory, signer),
    TokenHolder: deployOrAttach('TokenHolder', TokenHolder__factory, signer),
    TransparentUpgradeableProxy: deployOrAttach(
        'TransparentUpgradeableProxy',
        TransparentUpgradeableProxy__factory,
        signer
    ),

    // external contracts
    TokenGovernance: deployOrAttach('BNTToken', TokenGovernance__factory, signer),
    BNTToken: deployOrAttach('BNTToken', BNTToken__factory, signer),
    vBTToken: deployOrAttach('BNTToken', vBNTToken__factory, signer)

    /* eslint-enable camelcase */
});

export type ContractsType = ReturnType<typeof getContracts>;

export default getContracts();
