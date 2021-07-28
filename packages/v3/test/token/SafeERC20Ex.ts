import { expect } from 'chai';
import { ethers } from 'hardhat';
import { BigNumber } from 'ethers';

import { SignerWithAddress } from '@nomiclabs/hardhat-ethers/signers';

import Contracts from '../../components/Contracts';

import { TestSafeERC20Ex, TestERC20Token } from '../../typechain';

const TOTAL_SUPPLY = BigNumber.from(1_000_000);

let safeERC20: TestSafeERC20Ex;
let token: TestERC20Token;

let spender: SignerWithAddress;
let sender: string;

describe('SafeERC20Ex', () => {
    before(async () => {
        [, spender] = await ethers.getSigners();
    });

    beforeEach(async () => {
        safeERC20 = await Contracts.TestSafeERC20Ex.deploy();
        sender = safeERC20.address;

        token = await Contracts.TestERC20Token.deploy('ERC', 'ERC1', TOTAL_SUPPLY);

        await token.transfer(safeERC20.address, TOTAL_SUPPLY.div(BigNumber.from(2)));
    });

    it('should set allowance', async () => {
        const amount = BigNumber.from(100);

        expect(await token.allowance(sender, spender.address)).to.equal(BigNumber.from(0));

        await safeERC20.ensureApprove(token.address, spender.address, amount);

        expect(await token.allowance(sender, spender.address)).to.equal(amount);
    });

    context('with existing allowance', () => {
        const allowance = BigNumber.from(1000);

        beforeEach(async () => {
            await safeERC20.ensureApprove(token.address, spender.address, allowance);
        });

        it('should ignore the request when the allowance is sufficient', async () => {
            await safeERC20.ensureApprove(token.address, spender.address, allowance.sub(BigNumber.from(10)));

            expect(await token.allowance(sender, spender.address)).to.equal(allowance);
        });

        it('should allow increasing the allowance', async () => {
            const newAllowance = allowance.add(BigNumber.from(100));

            await safeERC20.ensureApprove(token.address, spender.address, newAllowance);

            expect(await token.allowance(sender, spender.address)).to.equal(newAllowance);
        });

        it('should ignore the request when the allowance is zero', async () => {
            await safeERC20.ensureApprove(token.address, spender.address, BigNumber.from(0));

            expect(await token.allowance(sender, spender.address)).to.equal(allowance);
        });
    });
});
