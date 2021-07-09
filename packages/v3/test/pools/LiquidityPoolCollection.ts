import { expect } from 'chai';
import { ethers } from 'hardhat';
import { BigNumber } from 'ethers';

import { SignerWithAddress } from '@nomiclabs/hardhat-ethers/signers';

import { NetworkSettings, PendingWithdrawals, BancorNetwork } from 'typechain';

import { shouldHaveGap } from 'test/helpers/Proxy';
import {
    createNetworkSettings,
    createPendingWithdrawals,
    createBancorNetwork,
    createLiquidityPoolCollection
} from 'test/helpers/Factory';

const DEFAULT_TRADING_FEE_PPM = BigNumber.from(2000);
const POOL_TYPE = BigNumber.from(1);

let accounts: SignerWithAddress[];
let nonOwner: SignerWithAddress;

let networkSettings: NetworkSettings;
let pendingWithdrawals: PendingWithdrawals;
let network: BancorNetwork;

describe('LiquidityPoolCollection', () => {
    shouldHaveGap('LiquidityPoolCollection', '_pools');

    before(async () => {
        accounts = await ethers.getSigners();

        [, nonOwner] = accounts;
    });

    beforeEach(async () => {
        networkSettings = await createNetworkSettings();
        pendingWithdrawals = await createPendingWithdrawals();
        network = await createBancorNetwork(networkSettings, pendingWithdrawals);
    });

    describe('construction', async () => {
        it('should revert when attempting to reinitialize', async () => {
            const collection = await createLiquidityPoolCollection(network);

            await expect(collection.initialize()).to.be.revertedWith('Initializable: contract is already initialized');
        });

        it('should be properly initialized', async () => {
            const collection = await createLiquidityPoolCollection(network);

            expect(await collection.version()).to.equal(1);

            expect(await collection.poolType()).to.equal(POOL_TYPE);
            expect(await collection.defaultTradingFeePPM()).to.equal(DEFAULT_TRADING_FEE_PPM);
        });
    });
});
