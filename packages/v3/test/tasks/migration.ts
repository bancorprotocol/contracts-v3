import { expect } from 'chai';
import { ethers } from 'hardhat';

import { SignerWithAddress } from '@nomiclabs/hardhat-ethers/signers';

import { deploySystem } from 'tasks/migration/deploy';
import { migrateSystem } from 'tasks/migration/migrate';

let accounts: SignerWithAddress[];
let spender: SignerWithAddress;

describe('Migration', () => {
    before(async () => {
        accounts = await ethers.getSigners();

        spender = accounts[5];
    });

    it('', async () => {
        const system = await deploySystem(accounts[0], {}, {});
        const newSystem = await migrateSystem(accounts[0], system, {});

        // Do some test on newSystem
    });
});
