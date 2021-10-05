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
    TestStakingRewards__factory,
    TestUpgradeable__factory,
    TokenHolder__factory,
    TransparentUpgradeableProxy__factory
} from '../typechain';
import { deployOrAttach } from './ContractBuilder';

/* eslint-enable camelcase */
import { Signer } from '@ethersproject/abstract-signer';

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
    TestStakingRewards: deployOrAttach('TestStakingRewards', TestStakingRewards__factory, signer),
    TestUpgradeable: deployOrAttach('TestUpgradeable', TestUpgradeable__factory, signer),
    TokenHolder: deployOrAttach('TokenHolder', TokenHolder__factory, signer),
    TransparentUpgradeableProxy: deployOrAttach(
        'TransparentUpgradeableProxy',
        TransparentUpgradeableProxy__factory,
        signer
    )
});

export type ContractsType = ReturnType<typeof getContracts>;

export default getContracts();
