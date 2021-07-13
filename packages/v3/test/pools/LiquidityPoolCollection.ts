import { expect } from 'chai';
import { ethers } from 'hardhat';
import { BigNumber } from 'ethers';

import { SignerWithAddress } from '@nomiclabs/hardhat-ethers/signers';

import Contracts from 'components/Contracts';
import { NetworkSettings, PendingWithdrawals, BancorNetwork, LiquidityPoolCollection, TestERC20Token } from 'typechain';
import { createSystem } from 'test/helpers/Factory';
import { PPM_RESOLUTION } from 'test/helpers/Constants';

const DEFAULT_TRADING_FEE_PPM = BigNumber.from(2000);
const POOL_TYPE = BigNumber.from(1);
const SYMBOL = 'TKN';
const EMPTY_STRING = '';

let accounts: SignerWithAddress[];
let nonOwner: SignerWithAddress;

let reserveToken: TestERC20Token;

describe('LiquidityPoolCollection', () => {
    before(async () => {
        accounts = await ethers.getSigners();

        [, nonOwner] = accounts;
    });

    beforeEach(async () => {
        reserveToken = await Contracts.TestERC20Token.deploy(SYMBOL, SYMBOL, BigNumber.from(1_000_000));
    });

    describe('construction', async () => {
        it('should be properly initialized', async () => {
            const { collection, network } = await createSystem();

            expect(await collection.version()).to.equal(1);

            expect(await collection.poolType()).to.equal(POOL_TYPE);
            expect(await collection.network()).to.equal(network.address);
            expect(await collection.defaultTradingFeePPM()).to.equal(DEFAULT_TRADING_FEE_PPM);
        });
    });

    describe('token symbol overrides', async () => {
        const newSymbol = 'TKN2';
        let collection: LiquidityPoolCollection;

        beforeEach(async () => {
            ({ collection } = await createSystem());
        });

        it('should revert when a non-owner attempts to set a token symbol override', async () => {
            await expect(
                collection.connect(nonOwner).setTokenSymbolOverride(reserveToken.address, newSymbol)
            ).to.be.revertedWith('ERR_ACCESS_DENIED');
        });

        it('should be to able to set and update a token symbol override', async () => {
            expect(await collection.tokenSymbolOverride(reserveToken.address)).to.equal(EMPTY_STRING);

            await collection.setTokenSymbolOverride(reserveToken.address, newSymbol);
            expect(await collection.tokenSymbolOverride(reserveToken.address)).to.equal(newSymbol);

            await collection.setTokenSymbolOverride(reserveToken.address, SYMBOL);
            expect(await collection.tokenSymbolOverride(reserveToken.address)).to.equal(SYMBOL);

            await collection.setTokenSymbolOverride(reserveToken.address, EMPTY_STRING);
            expect(await collection.tokenSymbolOverride(reserveToken.address)).to.equal(EMPTY_STRING);
        });
    });

    describe('default trading fee', async () => {
        const newDefaultTradingFree = BigNumber.from(100000);
        let collection: LiquidityPoolCollection;

        beforeEach(async () => {
            ({ collection } = await createSystem());

            expect(await collection.defaultTradingFeePPM()).to.equal(DEFAULT_TRADING_FEE_PPM);
        });

        it('should revert when a non-owner attempts to set the default trading fee', async () => {
            await expect(
                collection.connect(nonOwner).setDefaultTradingFreePPM(newDefaultTradingFree)
            ).to.be.revertedWith('ERR_ACCESS_DENIED');
        });

        it('should revert when setting the default trading fee to an invalid value', async () => {
            await expect(collection.setDefaultTradingFreePPM(PPM_RESOLUTION.add(BigNumber.from(1)))).to.be.revertedWith(
                'ERR_INVALID_FEE'
            );
        });

        it('should be to able to set and update the default trading fee', async () => {
            const res = await collection.setDefaultTradingFreePPM(newDefaultTradingFree);
            await expect(res)
                .to.emit(collection, 'DefaultTradingFeePPMUpdated')
                .withArgs(DEFAULT_TRADING_FEE_PPM, newDefaultTradingFree);

            expect(await collection.defaultTradingFeePPM()).to.equal(newDefaultTradingFree);

            const res2 = await collection.setDefaultTradingFreePPM(DEFAULT_TRADING_FEE_PPM);
            await expect(res2)
                .to.emit(collection, 'DefaultTradingFeePPMUpdated')
                .withArgs(newDefaultTradingFree, DEFAULT_TRADING_FEE_PPM);

            expect(await collection.defaultTradingFeePPM()).to.equal(DEFAULT_TRADING_FEE_PPM);
        });
    });
});
