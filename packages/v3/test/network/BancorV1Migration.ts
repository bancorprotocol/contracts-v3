import Contracts from '../../components/Contracts';
import { GovToken, NetworkToken, TokenGovernance } from '../../components/LegacyContracts';
import {
    BancorV1Migration,
    BancorVault,
    NetworkSettings,
    TestBancorNetwork,
    TestPoolCollection,
    TokenHolder
} from '../../typechain';
import { ETH, TKN } from '../helpers/Constants';
import { createPool, createSystem, createTokenHolder } from '../helpers/Factory';
import { createLegacySystem } from '../helpers/LegacyFactory';
import { toWei } from '../helpers/Types';
import { createTokenBySymbol, getBalance, getTransactionCost } from '../helpers/Utils';
import { expect } from 'chai';
import { BigNumber } from 'ethers';
import { ethers, waffle } from 'hardhat';

describe.only('BancorV1Migration', () => {
    const INITIAL_RATE = { n: BigNumber.from(1), d: BigNumber.from(2) };
    const MAX_DEVIATION = BigNumber.from(10_000); // %1
    const MINTING_LIMIT = toWei(BigNumber.from(10_000_000));
    const WITHDRAWAL_FEE = BigNumber.from(50_000); // 5%
    const MIN_LIQUIDITY_FOR_TRADING = toWei(BigNumber.from(100_000));
    const DEPOSIT_LIMIT = toWei(BigNumber.from(100_000_000));
    const TOTAL_SUPPLY = BigNumber.from(10).pow(BigNumber.from(25));
    const RESERVE1_AMOUNT = BigNumber.from(1000000);
    const RESERVE2_AMOUNT = BigNumber.from(2500000);

    let networkTokenGovernance: TokenGovernance;
    let govTokenGovernance: TokenGovernance;
    let network: TestBancorNetwork;
    let networkSettings: NetworkSettings;
    let networkToken: NetworkToken;
    let govToken: GovToken;
    let poolCollection: TestPoolCollection;
    let bancorVault: BancorVault;
    let externalProtectionWallet: TokenHolder;
    let bancorV1Migration: BancorV1Migration;
    let converter: any;
    let poolToken: any;
    let baseToken: any;
    let owner: any;

    const setup = async () => {
        ({
            networkTokenGovernance,
            govTokenGovernance,
            network,
            networkSettings,
            networkToken,
            govToken,
            poolCollection,
            bancorVault
        } = await createSystem());

        bancorV1Migration = await Contracts.BancorV1Migration.deploy(network.address);

        await networkSettings.setAverageRateMaxDeviationPPM(MAX_DEVIATION);
        await networkSettings.setWithdrawalFeePPM(WITHDRAWAL_FEE);
        await networkSettings.setMinLiquidityForTrading(MIN_LIQUIDITY_FOR_TRADING);

        externalProtectionWallet = await createTokenHolder();
        await externalProtectionWallet.transferOwnership(network.address);
        await network.setExternalProtectionWallet(externalProtectionWallet.address);
    };

    const initLegacySystem = async (isETH: boolean) => {
        [owner] = await ethers.getSigners();

        baseToken = await createTokenBySymbol(isETH ? ETH : TKN);

        ({ poolToken, converter } = await createLegacySystem(
            owner,
            network,
            networkToken,
            networkTokenGovernance,
            govTokenGovernance,
            baseToken
        ));

        await networkTokenGovernance.mint(owner.address, TOTAL_SUPPLY);

        await createPool(baseToken, network, networkSettings, poolCollection);
        await networkSettings.setPoolMintingLimit(baseToken.address, MINTING_LIMIT);
        await poolCollection.setDepositLimit(baseToken.address, DEPOSIT_LIMIT);
        await poolCollection.setInitialRate(baseToken.address, INITIAL_RATE);

        await networkToken.approve(converter.address, RESERVE2_AMOUNT);

        let value = BigNumber.from(0);
        if (isETH) {
            value = RESERVE1_AMOUNT;
        } else {
            await baseToken.approve(converter.address, RESERVE1_AMOUNT);
        }

        await converter.addLiquidity([baseToken.address, networkToken.address], [RESERVE1_AMOUNT, RESERVE2_AMOUNT], 1, {
            value: value
        });
    };

    for (const isETH of [false, true]) {
        describe(`base token (${isETH ? 'ETH' : 'ERC20'})`, () => {
            let poolTokenAmount: BigNumber;

            beforeEach(async () => {
                await waffle.loadFixture(setup);
                await initLegacySystem(isETH);
                poolTokenAmount = await getBalance(poolToken, owner.address);
                await poolToken.approve(bancorV1Migration.address, poolTokenAmount);
            });

            it('verifies that the caller can migrate pool tokens', async () => {
                const prevVaultNetworkBalance = await getBalance(networkToken, bancorVault.address);
                const prevVaultBaseBalance = await getBalance(baseToken, bancorVault.address);
                const prevOwnerBaseBalance = await getBalance(baseToken, owner.address);
                const prevOwnerGovBalance = await govToken.balanceOf(owner.address);

                const res = await bancorV1Migration.migratePoolTokens(poolToken.address, poolTokenAmount);
                const transactionCost = isETH ? await getTransactionCost(res) : BigNumber.from(0);

                const currVaultNetworkBalance = await getBalance(networkToken, bancorVault.address);
                const currVaultBaseBalance = await getBalance(baseToken, bancorVault.address);
                const currOwnerBaseBalance = await getBalance(baseToken, owner.address);
                const currOwnerGovBalance = await govToken.balanceOf(owner.address);

                expect(currVaultNetworkBalance).to.equal(prevVaultNetworkBalance.add(RESERVE2_AMOUNT));
                expect(currVaultBaseBalance).to.equal(prevVaultBaseBalance.add(RESERVE1_AMOUNT));
                expect(currOwnerBaseBalance).to.equal(prevOwnerBaseBalance.sub(transactionCost));
                expect(currOwnerGovBalance).to.equal(prevOwnerGovBalance);
            });
        });
    }
});
