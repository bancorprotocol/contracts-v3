import Contracts from '../../components/Contracts';
import { PoolToken, TestERC20Token } from '../../typechain';
import { ZERO_ADDRESS, MAX_UINT256 } from '../helpers/Constants';
import { prepareEach } from '../helpers/Fixture';
import { domainSeparator, permitSignature } from '../helpers/Permit';
import { latest, duration } from '../helpers/Time';
import { SignerWithAddress } from '@nomiclabs/hardhat-ethers/signers';
import { expect } from 'chai';
import { BigNumber, Wallet } from 'ethers';
import { ethers } from 'hardhat';

describe('PoolToken', () => {
    const NAME = 'Pool Token';
    const SYMBOL = 'POOL';
    const DECIMALS = BigNumber.from(10);

    let poolToken: PoolToken;
    let reserveToken: TestERC20Token;

    let owner: SignerWithAddress;
    let spender: SignerWithAddress;
    let nonOwner: SignerWithAddress;

    before(async () => {
        [owner, nonOwner, spender] = await ethers.getSigners();
    });

    prepareEach(async () => {
        reserveToken = await Contracts.TestERC20Token.deploy('ERC', 'ERC', BigNumber.from(1_000_000));
    });

    describe('construction', () => {
        it('should be properly initialized', async () => {
            poolToken = await Contracts.PoolToken.deploy(NAME, SYMBOL, DECIMALS, reserveToken.address);

            expect(await poolToken.name()).to.equal(NAME);
            expect(await poolToken.symbol()).to.equal(SYMBOL);
            expect(await poolToken.decimals()).to.equal(DECIMALS);
            expect(await poolToken.totalSupply()).to.equal(BigNumber.from(0));
            expect(await poolToken.reserveToken()).to.equal(reserveToken.address);
        });

        it('should revert when initialized with an invalid base reserve token', async () => {
            await expect(Contracts.PoolToken.deploy(NAME, SYMBOL, DECIMALS, ZERO_ADDRESS)).to.be.revertedWith(
                'InvalidAddress'
            );
        });
    });

    describe('minting', () => {
        prepareEach(async () => {
            poolToken = await Contracts.PoolToken.deploy(NAME, SYMBOL, DECIMALS, reserveToken.address);
        });

        it('should revert when the owner attempts to issue tokens to an invalid address', async () => {
            await expect(poolToken.mint(ZERO_ADDRESS, BigNumber.from(1))).to.be.revertedWith('InvalidExternalAddress');
        });

        it('should revert when the owner attempts to issue tokens to the token address', async () => {
            await expect(poolToken.mint(poolToken.address, BigNumber.from(1))).to.be.revertedWith(
                'InvalidExternalAddress'
            );
        });

        it('should revert when a non owner attempts to issue tokens', async () => {
            await expect(poolToken.connect(nonOwner).mint(owner.address, BigNumber.from(1))).to.be.revertedWith(
                'AccessDenied'
            );
        });
    });

    describe('permitting', () => {
        const wallet = Wallet.createRandom();
        let sender: string;

        prepareEach(async () => {
            sender = await wallet.getAddress();

            poolToken = await Contracts.PoolToken.deploy(NAME, SYMBOL, DECIMALS, reserveToken.address);

            await poolToken.mint(sender, BigNumber.from(10000));
        });

        it('should have the correct domain separator', async () => {
            expect(await poolToken.DOMAIN_SEPARATOR()).to.equal(await domainSeparator(NAME, poolToken.address));
        });

        it('should permit', async () => {
            const amount = BigNumber.from(1000);
            const { v, r, s } = await permitSignature(
                wallet,
                NAME,
                poolToken.address,
                spender.address,
                amount,
                BigNumber.from(0),
                MAX_UINT256
            );

            await poolToken.permit(sender, spender.address, amount, MAX_UINT256, v, r, s);

            expect(await poolToken.nonces(sender)).to.equal(BigNumber.from(1));
            expect(await poolToken.allowance(sender, spender.address)).to.equal(amount);
        });

        it('should reject a reused signature', async () => {
            const amount = BigNumber.from(100);
            const { v, r, s } = await permitSignature(
                wallet,
                NAME,
                poolToken.address,
                spender.address,
                amount,
                BigNumber.from(0),
                MAX_UINT256
            );

            await poolToken.permit(sender, spender.address, amount, MAX_UINT256, v, r, s);

            await expect(poolToken.permit(sender, spender.address, amount, MAX_UINT256, v, r, s)).to.be.revertedWith(
                'ERC20Permit: invalid signature'
            );
        });

        it('should reject an invalid signature', async () => {
            const amount = BigNumber.from(222);
            const otherWallet = Wallet.createRandom();
            const { v, r, s } = await permitSignature(
                otherWallet,
                NAME,
                poolToken.address,
                spender.address,
                amount,
                BigNumber.from(0),
                MAX_UINT256
            );

            await expect(poolToken.permit(sender, spender.address, amount, MAX_UINT256, v, r, s)).to.be.revertedWith(
                'ERC20Permit: invalid signature'
            );
        });

        it('should reject an expired permit', async () => {
            const amount = BigNumber.from(500);
            const deadline = (await latest()).sub(duration.weeks(1));
            const { v, r, s } = await permitSignature(
                wallet,
                NAME,
                poolToken.address,
                spender.address,
                amount,
                BigNumber.from(0),
                deadline
            );

            await expect(poolToken.permit(sender, spender.address, amount, deadline, v, r, s)).to.be.revertedWith(
                'ERC20Permit: expired deadline'
            );
        });
    });
});
